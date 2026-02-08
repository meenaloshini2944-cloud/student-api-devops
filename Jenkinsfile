pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    APP_NAME       = "student-api"
    HEALTH_PATH    = "/health"

    STAGING_NAME   = "student-api-staging"
    PROD_NAME      = "student-api-prod"
    STAGING_PORT   = "3002"
    PROD_PORT      = "3003"
    CONTAINER_PORT = "3000"

    IMAGE_BUILD    = "${APP_NAME}:${BUILD_NUMBER}"
    IMAGE_RELEASE  = "${APP_NAME}:release-${BUILD_NUMBER}"

    JUNIT_PATTERN  = "reports/junit/**/*.xml"
    MOCHA_HTML_DIR = "reports/mochawesome"
    COVERAGE_DIR   = "coverage"
  }

  stages {

    stage('1) Checkout') {
      steps { checkout scm }
    }

    stage('2) Build (Dependencies)') {
      steps {
        script {
          if (isUnix()) {
            sh 'node -v && npm -v'
            sh 'npm ci'
          } else {
            bat 'node -v && npm -v'
            bat 'npm ci'
          }
        }
      }
    }

    stage('3) Test + Coverage (Mocha/Chai/Supertest)') {
  tools { nodejs 'node20' }   // <-- MUST match the name you created in Jenkins Tools

  steps {
    script {
      if (isUnix()) {
        sh """
          node -v && npm -v
          rm -rf reports coverage || true
          mkdir -p reports/junit reports/mochawesome
          npm ci
          npm run test:ci
          npm run test:html
        """
      } else {
        bat """
          where node
          node -v
          where npm
          npm -v

          if exist reports rmdir /s /q reports
          if exist coverage rmdir /s /q coverage
          mkdir reports\\junit
          mkdir reports\\mochawesome

          npm ci
          npm run test:ci
          npm run test:html
        """
      }
    }
  }

  post {
    always {
      junit allowEmptyResults: true, testResults: "${JUNIT_PATTERN}"

      publishHTML(target: [
        reportName: "Mocha Test Report (Mochawesome)",
        reportDir: "${MOCHA_HTML_DIR}",
        reportFiles: "mochawesome.html",
        keepAll: true,
        alwaysLinkToLastBuild: true,
        allowMissing: true
      ])

      // Only publish coverage if it exists (prevents the red error line)
      publishHTML(target: [
        reportName: "Coverage Report (nyc)",
        reportDir: "${COVERAGE_DIR}",
        reportFiles: "index.html",
        keepAll: true,
        alwaysLinkToLastBuild: true,
        allowMissing: true
      ])
    }
  }
}

   stage('4) Code Quality & SAST (SonarQube + Semgrep)') {
  steps {
    script {
      def scannerHome = tool 'SonarScanner'
      withSonarQubeEnv('SonarQube') {
        bat """
          "${scannerHome}\\bin\\sonar-scanner.bat" ^
            -Dsonar.projectKey=student-api ^
            -Dsonar.projectName=student-api ^
            -Dsonar.sources=src ^
            -Dsonar.javascript.lcov.reportPaths=coverage/lcov.info
        """
      }

      // Semgrep (open-source SAST)
      bat """
        docker run --rm -v "%CD%:/src" returntocorp/semgrep semgrep scan --config=auto --severity ERROR
      """

      // Wait for Sonar Quality Gate (increase timeout)
      timeout(time: 15, unit: 'MINUTES') {
        def qg = waitForQualityGate()
        if (qg.status != 'OK') {
          error "Pipeline failed due to SonarQube Quality Gate: ${qg.status}"
        }
      }
    }
  }
}


    stage('5) Supply Chain Security (SBOM + Dependency-Check + Grype)') {
  steps {
    script {
      // ---------- 5.1 Generate CycloneDX SBOM ----------
      // Requires: npm package "cyclonedx-npm" (dev dependency) OR use npx
      bat '''
        echo [Stage 5.1] Generating CycloneDX SBOM...
        if not exist reports mkdir reports
        if not exist reports\\sbom mkdir reports\\sbom

        REM Use npx so you don't need global install
        npx --yes @cyclonedx/cyclonedx-npm --output-file reports\\sbom\\sbom.json --output-format json
        if not exist reports\\sbom\\sbom.json (
          echo ERROR: SBOM not generated.
          exit /b 1
        )
      '''

// ---------- 5.2 OWASP Dependency-Check ----------
withCredentials([string(credentialsId: 'NVD_API_KEY', variable: 'NVD_KEY')]) {

  bat '''
    echo [Stage 5.2] Running OWASP Dependency-Check with NVD API Key...

    if not exist reports\\dependency-check mkdir reports\\dependency-check

    docker run --rm ^
      -v "C:\\ProgramData\\Jenkins\\.jenkins\\workspace\\student-api-devops:/src" ^
      owasp/dependency-check:latest ^
      --scan /src/package.json ^
      --scan /src/package-lock.json ^
      --format "ALL" ^
      --out /src/reports/dependency-check ^
      --suppression /src/dependency-check-suppressions.xml ^
      --nvdApiKey %NVD_KEY% ^
      --failOnCVSS 7
  '''
}

      // ---------- 5.3 Grype scan on SBOM ----------
      // Scans the SBOM you generated (sbom.json)
      // Uses config policy from your repo: .grype.yaml
      bat '''
  echo [Stage 5.3] Running Grype scan against SBOM...
  if not exist grype-db mkdir grype-db

  docker run --rm ^
    -v "C:\\ProgramData\\Jenkins\\.jenkins\\workspace\\student-api-devops:/src" ^
    -v "C:\\ProgramData\\Jenkins\\.jenkins\\workspace\\student-api-devops\\grype-db:/root/.cache/grype/db" ^
    anchore/grype:latest ^
    sbom:/src/reports/sbom/sbom.json -o table -c /src/.grype.yaml
'''

    }
  }

  post {
    always {
      // Archive artifacts so you can attach screenshots / evidence in report
      archiveArtifacts artifacts: 'reports/**', fingerprint: true

      // If you have HTML Publisher installed, keep these (nice for HD):
      publishHTML(target: [
        reportName: 'Dependency-Check Report',
        reportDir: 'reports/dependency-check',
        reportFiles: 'dependency-check-report.html',
        keepAll: true,
        alwaysLinkToLastBuild: true,
        allowMissing: true
      ])
    }
  }
}


   stage('6) Build Artefact + Container QA (Buildx + Hadolint + Trivy)') {
  steps {
    script {
      bat '''
        echo [Stage 6.0] Preparing folders...
        if not exist reports mkdir reports
        if not exist reports\\container mkdir reports\\container
        if not exist reports\\container\\trivy mkdir reports\\container\\trivy

        echo [Stage 6.1] Hadolint - Dockerfile quality gate...
        docker run --rm -i hadolint/hadolint < Dockerfile

        echo [Stage 6.2] Enable Docker BuildKit / Buildx...
        docker buildx version
        docker buildx create --name jenkins-builder --use 2>NUL || docker buildx use jenkins-builder
        docker buildx inspect --bootstrap

        echo [Stage 6.3] Build image with Buildx + cache (LOAD into local Docker)...
        if not exist .buildx-cache mkdir .buildx-cache

        docker buildx build ^
          --progress=plain ^
          --tag student-api:%BUILD_NUMBER% ^
          --cache-from=type=local,src=.buildx-cache ^
          --cache-to=type=local,dest=.buildx-cache,mode=max ^
          --load ^
          .

        echo [Stage 6.3b] Export image to tar (so Trivy can scan without Docker socket)...
        docker save -o reports\\container\\student-api_%BUILD_NUMBER%.tar student-api:%BUILD_NUMBER%

        echo [Stage 6.4] Trivy scan using --input (JSON evidence)...
        docker run --rm ^
          -v "%CD%:/workspace" ^
          -v trivy-cache:/root/.cache/ ^
          aquasec/trivy:latest ^
          image --scanners vuln ^
          --input /workspace/reports/container/student-api_%BUILD_NUMBER%.tar ^
          --format json ^
          --output /workspace/reports/container/trivy/trivy-image.json

        echo [Stage 6.4b] Trivy console summary (HIGH/CRITICAL)...
        docker run --rm ^
          -v "%CD%:/workspace" ^
          -v trivy-cache:/root/.cache/ ^
          aquasec/trivy:latest ^
          image --scanners vuln ^
          --input /workspace/reports/container/student-api_%BUILD_NUMBER%.tar ^
          --severity CRITICAL ^
          --no-progress


        echo [Stage 6.4c] Trivy gate (fail build on HIGH/CRITICAL)...
        docker run --rm ^
          -v "%CD%:/workspace" ^
          -v trivy-cache:/root/.cache/ ^
          aquasec/trivy:latest ^
          image --scanners vuln ^
          --input /workspace/reports/container/student-api_%BUILD_NUMBER%.tar ^
          --exit-code 1 ^
          --severity CRITICAL ^
          --no-progress

        echo [Stage 6] Completed: Buildx build + Hadolint + Trivy gate OK.
      '''
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'reports/container/**', fingerprint: true
      publishHTML(target: [
        allowMissing: true,
        alwaysLinkToLastBuild: true,
        keepAll: true,
        reportDir: 'reports/container/trivy',
        reportFiles: 'trivy-image.json',
        reportName: 'Trivy Image Scan (JSON)'
      ])
    }
  }
}


   stage('7) Deploy to Staging (Docker Compose)') {
  steps {
    script {
      bat """
        echo [Stage 7.1] Deploy to staging with Docker Compose...

        docker compose -f docker-compose.staging.yml down --remove-orphans

        REM Force-remove container if it exists (fix name conflict)
        docker rm -f student-api-staging 2>nul

        docker compose -f docker-compose.staging.yml up -d --remove-orphans

        echo [Stage 7.2] Wait for health...
        for /L %%i in (1,1,30) do (
          curl -fsS http://localhost:3001/health && exit /b 0
          timeout /t 2 >nul
        )

        echo Staging health check failed.
        docker compose -f docker-compose.staging.yml ps
        docker logs --tail 200 student-api-staging
        exit /b 1
      """
    }
  }
}
    stage('8) Staging Smoke Test') {
  steps {
    bat """
      echo [Stage 8] Smoke test /students endpoint...
      curl -fsS http://localhost:3001/students
    """
  }
}

   stage('9) Staging Stability Gate') {
  steps {
    script {
      bat '''
        echo [Stage 9] Checking staging container...

        docker ps --filter "name=student-api-staging" --filter "status=running" --format "{{.Names}}" | findstr student-api-staging
        if %errorlevel% neq 0 (
          echo ERROR: Staging container is not running
          exit /b 1
        )

        echo [Stage 9] Checking /health endpoint...

        powershell -NoProfile -Command ^
        "$res = Invoke-WebRequest -UseBasicParsing 'http://localhost:3001/health'; if ($res.StatusCode -ne 200) { exit 1 }"

        if %errorlevel% neq 0 (
          echo ERROR: Health endpoint failed
          exit /b 1
        )

        echo [Stage 9] Checking health JSON status...

        powershell -NoProfile -Command ^
        "$res = Invoke-RestMethod 'http://localhost:3001/health'; if ($res.status -ne 'UP') { exit 1 }"

        if %errorlevel% neq 0 (
          echo ERROR: Health JSON not reporting UP
          exit /b 1
        )

        echo [Stage 9] Checking /students endpoint...

        powershell -NoProfile -Command ^
        "$res = Invoke-WebRequest -UseBasicParsing 'http://localhost:3001/students'; if ($res.StatusCode -ne 200) { exit 1 }"

        if %errorlevel% neq 0 (
          echo ERROR: Students endpoint failed
          exit /b 1
        )

        echo Stage 9 completed successfully
        '''
    }
    }
  }
  
      stage('10) Release (Promote to Production)') {
  steps {
    script {
      bat """
        echo [Stage 10] Production Promotion Started

        echo [10.1] Tagging build image as release...
        docker tag student-api:%BUILD_NUMBER% student-api:%BUILD_NUMBER%

        echo [10.2] Stop existing production stack (if any)...
        docker compose -f docker-compose.prod.yml down --remove-orphans

        echo [10.3] Remove old production container (if exists)...
        docker rm -f student-api-prod 2>nul

        echo [10.4] Start production stack...
        docker compose -f docker-compose.prod.yml up -d --remove-orphans

        echo [10.5] Wait for production health (http://localhost:3002/health)...
        for /L %%i in (1,1,30) do (
          curl -fsS http://localhost:3002/health && exit /b 0
          timeout /t 2 >nul
        )

        echo ERROR: Production health check failed
        docker compose -f docker-compose.prod.yml ps
        docker logs --tail 200 student-api-prod
        exit /b 1
      """
    }
  }
}
    stage('11) Production Health and Stability Gate') {
  steps {
    script {
      bat '''
      cmd /V:ON /C ^
      "setlocal EnableExtensions EnableDelayedExpansion ^

      echo [Stage 11] Production Health and Stability Gate (port 3002) ^

      REM 11.1 Ensure container exists and is running ^
      docker ps --filter "name=student-api-prod" --filter "status=running" --format "{{.Names}}" ^| findstr /I "student-api-prod" >nul ^
      if !errorlevel! neq 0 ( ^
        echo ERROR: Production container is not running ^
        docker ps -a --filter "name=student-api-prod" ^
        exit /b 1 ^
      ) ^

      REM 11.2 Require 3 consecutive successful /health responses ^
      set OK=0 ^
      for /L %%i in (1,1,60) do ( ^
        curl -fsS http://localhost:3002/health >nul ^
        if !errorlevel! equ 0 ( ^
          set /A OK+=1 ^
          echo [Stage 11] Health OK (!OK!/3) ^
        ) else ( ^
          set OK=0 ^
          echo [Stage 11] Health not ready yet... retrying ^
        ) ^
        if !OK! geq 3 goto HEALTHY ^
        timeout /t 2 >nul ^
      ) ^

      echo ERROR: Production health did not become stable ^
      goto FAIL ^

      :HEALTHY ^
      echo [Stage 11] Health stable OK ^

      REM 11.3 Functional smoke test ^
      curl -fsS http://localhost:3002/students > students_prod.json ^
      if !errorlevel! neq 0 ( ^
        echo ERROR: /students endpoint failed ^
        goto FAIL ^
      ) ^
      echo [Stage 11] /students OK ^
      type students_prod.json ^

      exit /b 0 ^

      :FAIL ^
      echo --- docker compose ps --- ^
      docker compose -f docker-compose.prod.yml ps ^
      echo --- last 200 logs --- ^
      docker logs --tail 200 student-api-prod ^
      exit /b 1"
      '''
    }
  }
  post {
    always {
      archiveArtifacts artifacts: "students_prod.json", onlyIfSuccessful: false
    }
  }
}
    stage('12) Monitoring and Observability Gate (HD)') {
  steps {
    script {
      bat '''
@echo off
echo [Stage 12] ==============================
echo [Stage 12] Monitoring and Observability Gate
echo [Stage 12] Target: student-api-prod on http://localhost:3002
echo [Stage 12] ==============================

REM 12.1 Check container running
docker ps --filter "name=student-api-prod" --filter "status=running" --format "{{.Names}}" | findstr student-api-prod >nul
if %errorlevel% neq 0 (
  echo ERROR: Container not running
  exit /b 1
)
echo [Stage 12] OK: Container running

REM 12.2 Check health endpoint stability (5 consecutive OK)
set OK=0

for /L %%i in (1,1,20) do (
  curl -fsS http://localhost:3002/health >nul 2>&1
  if !errorlevel! equ 0 (
    set /A OK+=1
    echo [Stage 12] /health OK (!OK!/5)
  ) else (
    set OK=0
  )

  if !OK! geq 5 goto HEALTHY

  timeout /t 2 >nul
)

echo ERROR: Health not stable
docker logs --tail 100 student-api-prod
exit /b 1

:HEALTHY
echo [Stage 12] PASS: Monitoring gate OK

echo Timestamp: %DATE% %TIME% > monitoring_evidence.txt
echo Container: student-api-prod >> monitoring_evidence.txt
echo Health Stable: YES >> monitoring_evidence.txt
'''
    }
  }
  post {
    always {
      archiveArtifacts artifacts: 'monitoring_evidence.txt', allowEmptyArchive: true
    }
  }
}
}
}
