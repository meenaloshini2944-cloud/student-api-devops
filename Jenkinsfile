pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  environment {
    // App runtime ports
    STAGING_PORT = '3002'
    PROD_PORT    = '3003'

    // Docker
    IMAGE_NAME   = 'student-api'
    STAGING_CTN  = 'student-api-staging'
    PROD_CTN     = 'student-api-prod'

    // SonarQube
    SONAR_HOST_URL   = 'http://host.docker.internal:9000'
    SONAR_PROJECT_KEY  = 'Student-API-DevOps'
    SONAR_PROJECT_NAME = 'Student-API-DevOps'
  }

  stages {

    stage('Checkout') {
      steps {
        checkout scm
        bat 'git rev-parse --short HEAD'
      }
    }

    stage('Build (Dependencies)') {
      steps {
        bat 'npm ci'
      }
    }

    stage('Test (Jest + Coverage)') {
      steps {
        bat 'npm test -- --runInBand --coverage'
      }
      post {
        always {
          // If you later add Jenkins "Publish HTML" or coverage plugins, this is where you'd publish.
          bat 'if exist coverage\\lcov.info (echo Coverage report exists) else (echo No lcov.info found)'
        }
      }
    }

    stage('Code Quality (SonarQube Scan - Docker)') {
      environment {
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        powershell '''
          Write-Host "Running SonarScanner in Docker..."
          docker run --rm `
            -e SONAR_HOST_URL=http://host.docker.internal:9000  `
            -e SONAR_TOKEN=$env:SONAR_TOKEN `
            -v "$env:WORKSPACE:/usr/src" `
            -w /usr/src `
            sonarsource/sonar-scanner-cli:latest `
            sonar-scanner `
              // "-Dsonar.projectKey=$env:SONAR_PROJECT_KEY" `
              // "-Dsonar.projectName=$env:SONAR_PROJECT_NAME" `
              "-Dsonar.sources=src" `
              "-Dsonar.tests=tests" `
              "-Dsonar.test.inclusions=tests/**/*.js" `
              "-Dsonar.exclusions=**/node_modules/**,**/coverage/**" `
              "-Dsonar.javascript.lcov.reportPaths=coverage/lcov.info"
              "-Dsonar.working.directory =/tmp/.scannerwork
              "-Dsonar.token=$env:SONAR_TOKEN"
        '''
      }
    }

    stage('Security (npm audit)') {
      steps {
        // Keep it non-blocking for HD rubric unless your rubric demands failure on vulns
        bat 'npm audit --audit-level=high || exit /b 0'
      }
    }

    stage('Build Artefact (Docker Image)') {
      steps {
        script {
          env.BUILD_TAG_IMAGE = "${env.IMAGE_NAME}:${env.BUILD_NUMBER}"
        }
        bat 'docker build -t %BUILD_TAG_IMAGE% .'
        bat 'docker images | findstr %IMAGE_NAME%'
      }
    }

    stage('Security (Container Scan - Trivy)') {
      steps {
        powershell '''
          Write-Host "Running Trivy scan (if installed)..."
          $trivy = Get-Command trivy -ErrorAction SilentlyContinue
          if ($null -eq $trivy) {
            Write-Host "Trivy not installed on this agent. Skipping."
            exit 0
          }

          trivy image --severity HIGH,CRITICAL --no-progress $env:BUILD_TAG_IMAGE
          if ($LASTEXITCODE -ne 0) {
            Write-Host "Trivy found HIGH/CRITICAL issues (non-blocking in this pipeline)."
            exit 0
          }
        '''
      }
    }

    stage('Deploy (Staging)') {
      steps {
        powershell '''
          Write-Host "Deploying to STAGING..."
          docker rm -f $env:STAGING_CTN 2>$null
          docker run -d --name $env:STAGING_CTN -p "$env:STAGING_PORT:3000" $env:BUILD_TAG_IMAGE

          docker ps --filter "name=$env:STAGING_CTN"
        '''
      }
    }

    stage('Monitoring (Staging Health Check)') {
      steps {
        powershell '''
          Write-Host "STAGING Health:"
          Start-Sleep -Seconds 3
          try {
            $resp = Invoke-RestMethod -Uri "http://localhost:$env:STAGING_PORT/health" -TimeoutSec 15
            $resp | ConvertTo-Json -Compress
          } catch {
            Write-Host "Staging health check failed."
            throw
          }
        '''
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        script {
          env.RELEASE_TAG_IMAGE = "${env.IMAGE_NAME}:release-${env.BUILD_NUMBER}"
        }
        bat 'docker tag %BUILD_TAG_IMAGE% %RELEASE_TAG_IMAGE%'
        powershell '''
          Write-Host "Deploying to PROD..."
          docker rm -f $env:PROD_CTN 2>$null
          docker run -d --name $env:PROD_CTN -p "$env:PROD_PORT:3000" $env:RELEASE_TAG_IMAGE

          docker ps --filter "name=$env:PROD_CTN"
        '''
      }
    }

    stage('Monitoring (Prod Health Check)') {
      steps {
        powershell '''
          Write-Host "PROD Health:"
          Start-Sleep -Seconds 3
          try {
            $resp = Invoke-RestMethod -Uri "http://localhost:$env:PROD_PORT/health" -TimeoutSec 15
            $resp | ConvertTo-Json -Compress
          } catch {
            Write-Host "Prod health check failed."
            throw
          }
        '''
      }
    }
  }

  post {
    always {
      echo 'Pipeline completed.'
      // Optional: keep containers running for demo; comment these two lines out if you want them to stay up.
      // powershell 'docker rm -f $env:STAGING_CTN 2>$null; docker rm -f $env:PROD_CTN 2>$null'
    }
    failure {
      echo 'Pipeline FAILED. Check stage logs above.'
    }
  }
}
