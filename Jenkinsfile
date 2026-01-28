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

   stage('4) Code Quality (SonarQube)') {
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
      // Optional: Wait for Quality Gate (HD feature)
      timeout(time: 5, unit: 'MINUTES') {
        waitForQualityGate abortPipeline: true
      }

      // ---------- Semgrep (SAST) ----------
      echo "Running Semgrep SAST scan..."
      bat """
      docker run --rm -v "%CD%:/src" returntocorp/semgrep semgrep scan --config=auto --severity ERROR
      """

    }
  }
}


    stage('5) Security (Dependency Audit)') {
      steps {
        script {
          if (isUnix()) {
            sh 'npm audit --audit-level=high || true'
          } else {
            bat 'npm audit --audit-level=high || exit /b 0'
          }
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
