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
      steps {
        script {
          if (isUnix()) {
            sh """
              rm -rf reports coverage || true
              mkdir -p reports/junit reports/mochawesome
              npm run test:ci
              npm run test:html
            """
          } else {
            bat """
              if exist reports rmdir /s /q reports
              if exist coverage rmdir /s /q coverage
              mkdir reports\\junit
              mkdir reports\\mochawesome
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
      // Uses Docker image so you don't need Java/Dependency-Check installed on Jenkins
      // Output: reports/dependency-check (HTML + XML + JSON)
      bat '''
        echo [Stage 5.2] Running OWASP Dependency-Check...
        if not exist reports\\dependency-check mkdir reports\\dependency-check

        docker run --rm ^
          -v "%CD%:/src" ^
          owasp/dependency-check:latest ^
          --scan /src/package.json ^
          --scan /src/package-lock.json ^
          --format "ALL" ^
          --out /src/reports/dependency-check ^
          --suppression /src/dependency-check-suppressions.xml ^
          --nvdApiKey "" ^
          --failOnCVSS 7

        REM Dependency-Check returns non-zero if CVSS threshold hit. That’s intended.
      '''

      // ---------- 5.3 Grype scan on SBOM ----------
      // Scans the SBOM you generated (sbom.json)
      // Uses config policy from your repo: .grype.yaml
      bat '''
        echo [Stage 5.3] Running Grype scan against SBOM...
        docker run --rm ^
          -v "%CD%:/src" ^
          anchore/grype:latest ^
          sbom:/src/reports/sbom/sbom.json ^
          -c /src/.grype.yaml ^
          -o table

        REM Grype will exit non-zero if policy says fail-on high/critical (from .grype.yaml)
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


    stage('6) Build Artefact (Docker Image)') {
      steps {
        script {
          if (isUnix()) sh "docker build -t ${IMAGE_BUILD} ."
          else          bat "docker build -t %IMAGE_BUILD% ."
        }
      }
    }

    stage('7) Deploy to Staging') {
      steps {
        script {
          if (isUnix()) {
            sh """
              docker rm -f ${STAGING_NAME} >/dev/null 2>&1 || true
              docker run -d --name ${STAGING_NAME} -p ${STAGING_PORT}:${CONTAINER_PORT} ${IMAGE_BUILD}
            """
          } else {
            bat """
              docker rm -f %STAGING_NAME% >NUL 2>&1
              docker run -d --name %STAGING_NAME% -p %STAGING_PORT%:%CONTAINER_PORT% %IMAGE_BUILD%
            """
          }
        }
      }
    }

    stage('8) Staging Health Check') {
      steps {
        script {
          def url = "http://localhost:${STAGING_PORT}${HEALTH_PATH}"
          if (isUnix()) sh "curl -fsS ${url}"
          else          bat "powershell -NoProfile -Command \"(Invoke-WebRequest -UseBasicParsing '${url}').StatusCode\""
        }
      }
    }

    stage('9) Release (Promote to Prod)') {
      steps {
        script {
          if (isUnix()) {
            sh "docker tag ${IMAGE_BUILD} ${IMAGE_RELEASE}"
            sh """
              docker rm -f ${PROD_NAME} >/dev/null 2>&1 || true
              docker run -d --name ${PROD_NAME} -p ${PROD_PORT}:${CONTAINER_PORT} ${IMAGE_RELEASE}
            """
          } else {
            bat "docker tag %IMAGE_BUILD% %IMAGE_RELEASE%"
            bat """
              docker rm -f %PROD_NAME% >NUL 2>&1
              docker run -d --name %PROD_NAME% -p %PROD_PORT%:%CONTAINER_PORT% %IMAGE_RELEASE%
            """
          }
        }
      }
    }

    stage('10) Production Health Check') {
      steps {
        script {
          def url = "http://localhost:${PROD_PORT}${HEALTH_PATH}"
          if (isUnix()) sh "curl -fsS ${url}"
          else          bat "powershell -NoProfile -Command \"(Invoke-WebRequest -UseBasicParsing '${url}').StatusCode\""
        }
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: "reports/**, coverage/**", allowEmptyArchive: true
    }
  }
}
