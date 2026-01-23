pipeline {
  agent any

  environment {
    // ---------- SonarQube ----------
    SONAR_HOST_URL  = 'http://host.docker.internal:9000'
    SONAR_PROJECT_KEY  = 'Student-API-DevOps'
    SONAR_PROJECT_NAME = 'Student-API-DevOps'

    // ---------- App ----------
    APP_PORT_IN_CONTAINER = '3000'
    STAGING_PORT_HOST = '3002'
    PROD_PORT_HOST    = '3003'

    // ---------- Image ----------
    IMAGE_NAME = "student-api:${BUILD_NUMBER}"
    RELEASE_TAG = "student-api:release-${BUILD_NUMBER}"
  }

  options {
    timestamps()
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
      }
    }

    stage('Build (Dependencies)') {
      steps {
        bat 'npm ci'
      }
    }

    stage('Test (Jest + Coverage)') {
      steps {
        // Generates coverage/lcov.info which Sonar will import
        bat 'npm test -- --runInBand --coverage'
      }
    }

    stage('Code Quality (SonarQube Scan - Docker)') {
  environment {
    SONAR_TOKEN = credentials('sonar-token')
  }
  steps {
    powershell '''
      docker run --rm `
        -e SONAR_HOST_URL="http://host.docker.internal:9000" `
        -e SONAR_TOKEN="$env:SONAR_TOKEN" `
        -v "$env:WORKSPACE:/usr/src" `
        -w /usr/src `
        sonarsource/sonar-scanner-cli:latest `
        sonar-scanner `
          -Dsonar.projectKey=Student-API-DevOps `
          -Dsonar.projectName=Student-API-DevOps `
          -Dsonar.sources=src `
          -Dsonar.tests=tests `
          -Dsonar.test.inclusions=tests/**/*.js `
          -Dsonar.exclusions=**/node_modules/**,**/coverage/** `
          -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info
    '''
  }
}


    stage('Quality Gate (Enforced via Sonar API)') {
      environment {
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        powershell '''
          $ErrorActionPreference = "Stop"

          $reportPath = Join-Path $env:WORKSPACE ".scannerwork\\report-task.txt"
          if (!(Test-Path $reportPath)) {
            throw "Sonar report-task.txt not found at: $reportPath. Ensure sonar.working.directory=.scannerwork"
          }

          $props = @{}
          Get-Content $reportPath | ForEach-Object {
            if ($_ -match "^(.*?)=(.*)$") { $props[$matches[1]] = $matches[2] }
          }

          $ceTaskUrl = $props["ceTaskUrl"]
          if ([string]::IsNullOrWhiteSpace($ceTaskUrl)) { throw "ceTaskUrl missing in report-task.txt" }

          # Build Basic Auth header from token (token:)
          $pair = "$($env:SONAR_TOKEN):"
          $b64  = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
          $hdrs = @{ Authorization = "Basic $b64" }

          Write-Host "Polling CE task: $ceTaskUrl"

          $deadline = (Get-Date).AddMinutes(5)
          $taskStatus = ""
          $analysisId = ""

          while ((Get-Date) -lt $deadline) {
            $ce = Invoke-RestMethod -Uri $ceTaskUrl -Headers $hdrs -Method Get
            $taskStatus = $ce.task.status
            $analysisId  = $ce.task.analysisId

            if ($taskStatus -eq "SUCCESS") { break }
            if ($taskStatus -in @("FAILED","CANCELED")) {
              throw "Sonar CE task ended with status: $taskStatus"
            }

            Start-Sleep -Seconds 3
          }

          if ($taskStatus -ne "SUCCESS") {
            throw "Timed out waiting for Sonar CE task to finish (last status: $taskStatus)"
          }

          if ([string]::IsNullOrWhiteSpace($analysisId)) {
            throw "analysisId not returned from CE task; cannot evaluate Quality Gate"
          }

          $qgUrl = "$($env:SONAR_HOST_URL)/api/qualitygates/project_status?analysisId=$analysisId"
          $qg = Invoke-RestMethod -Uri $qgUrl -Headers $hdrs -Method Get
          $qgStatus = $qg.projectStatus.status

          Write-Host "Quality Gate status: $qgStatus"

          if ($qgStatus -ne "OK") {
            throw "QUALITY GATE FAILED (status=$qgStatus). Check Sonar dashboard for details."
          }
        '''
      }
    }

    stage('Security (npm audit)') {
      steps {
        // Keep your prior behavior (do not fail pipeline on audit)
        bat 'npm audit --audit-level=high || exit /b 0'
      }
    }

    stage('Build Artefact (Docker Image)') {
      steps {
        bat "docker build -t %IMAGE_NAME% ."
        bat 'docker images | findstr student-api'
      }
    }

    stage('Security (Container Scan - Trivy)') {
      steps {
        // Uses Trivy via Docker. Works with Docker Desktop (Windows) by mounting the docker engine pipe.
        powershell '''
          $ErrorActionPreference = "Stop"

          # Trivy cache directory (optional but speeds up)
          $cache = Join-Path $env:USERPROFILE ".cache\\trivy"
          if (!(Test-Path $cache)) { New-Item -ItemType Directory -Force -Path $cache | Out-Null }

          docker run --rm `
            -v //./pipe/docker_engine:/var/run/docker.sock `
            -v "$cache:/root/.cache/" `
            aquasec/trivy:latest `
            image `
            --severity HIGH,CRITICAL `
            --exit-code 1 `
            "$env:IMAGE_NAME"
        '''
      }
    }

    stage('Deploy (Staging)') {
      steps {
        powershell '''
          docker rm -f student-api-staging 2>$null
          docker run -d --name student-api-staging -p "$env:STAGING_PORT_HOST:$env:APP_PORT_IN_CONTAINER" "$env:IMAGE_NAME"
          docker ps | findstr student-api-staging
        '''
      }
    }

    stage('Monitoring (Staging Health Check)') {
      steps {
        powershell '''
          Write-Host "STAGING Health:"
          curl.exe -s "http://localhost:$env:STAGING_PORT_HOST/health"
        '''
      }
    }

    stage('Security (DAST - OWASP ZAP Baseline on Staging)') {
      steps {
        // Mark UNSTABLE if ZAP finds issues (instead of failing the entire pipeline).
        catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
          powershell '''
            $ErrorActionPreference = "Stop"

            $target = "http://host.docker.internal:$env:STAGING_PORT_HOST"
            Write-Host "Running ZAP baseline against $target"

            docker run --rm `
              -t owasp/zap2docker-stable `
              zap-baseline.py `
                -t "$target" `
                -r zap_report.html `
                -J zap_report.json `
                -x zap_report.xml

            # If ZAP exits non-zero, catchError will mark build UNSTABLE.
          '''
        }
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        bat "docker tag %IMAGE_NAME% %RELEASE_TAG%"
        powershell '''
          docker rm -f student-api-prod 2>$null
          docker run -d --name student-api-prod -p "$env:PROD_PORT_HOST:$env:APP_PORT_IN_CONTAINER" "$env:RELEASE_TAG"
          docker ps | findstr student-api-prod
        '''
      }
    }

    stage('Monitoring (Prod Health Check)') {
      steps {
        powershell '''
          Write-Host "PROD Health:"
          curl.exe -s "http://localhost:$env:PROD_PORT_HOST/health"
        '''
      }
    }
  }

  post {
    always {
      echo 'Pipeline completed.'
      // Optional: archive ZAP reports if you want evidence for rubric
      // archiveArtifacts artifacts: 'zap_report.*', allowEmptyArchive: true
    }
  }
}
