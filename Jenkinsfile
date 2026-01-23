pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    APP_NAME        = "student-api"
    STAGING_NAME    = "student-api-staging"
    PROD_NAME       = "student-api-prod"
    STAGING_PORT    = "3002"
    PROD_PORT       = "3003"
    CONTAINER_PORT  = "3000"

    IMAGE_STAGING   = "student-api:${BUILD_NUMBER}"
    IMAGE_RELEASE   = "student-api:release-${BUILD_NUMBER}"
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

    stage('Test (Jest)') {
      steps {
        bat 'npm test'
      }
    }

    stage('Code Quality (SonarQube Scan)') {
      environment {
        SONAR_TOKEN = credentials('sonar-token')
      }
      steps {
        // Use Jenkins SonarQube server config (Manage Jenkins -> System)
        withSonarQubeEnv('SonarLocal') {
          powershell '''
            npx sonar-scanner `
              -D"sonar.projectKey=student-api-devops" `
              -D"sonar.projectName=Student API DevOps" `
              -D"sonar.sources=src" `
              -D"sonar.tests=tests" `
              -D"sonar.test.inclusions=tests/**/*.js" `
              -D"sonar.javascript.lcov.reportPaths=coverage/lcov.info" `
              -D"sonar.host.url=$env:SONAR_HOST_URL" `
              -D"sonar.login=$env:SONAR_TOKEN"
          '''
        }
      }
    }

    stage('Quality Gate (Fail if Red)') {
      steps {
        timeout(time: 5, unit: 'MINUTES') {
          waitForQualityGate abortPipeline: true
        }
      }
    }

    stage('Security (npm audit)') {
      steps {
        // If you want strict gating, remove "|| exit /b 0"
        bat 'npm audit --audit-level=high || exit /b 0'
      }
    }

    stage('Build Artefact (Docker Image)') {
      steps {
        bat "docker build -t ${IMAGE_STAGING} ."
        bat "docker images | findstr student-api"
      }
    }

    stage('Deploy (Staging)') {
      steps {
        powershell """
          docker stop ${STAGING_NAME} 2>`$null
          docker rm ${STAGING_NAME} 2>`$null

          docker run -d --name ${STAGING_NAME} -p ${STAGING_PORT}:${CONTAINER_PORT} ${IMAGE_STAGING}

          docker ps | Select-String ${STAGING_NAME}
        """
      }
    }

    stage('Monitoring (Staging Health Check)') {
      steps {
        powershell """
          Start-Sleep -Seconds 3
          \$resp = Invoke-RestMethod http://localhost:${STAGING_PORT}/health
          Write-Host 'Health Check Response:'
          \$resp | ConvertTo-Json -Compress | Write-Host
        """
      }
    }

    stage('Release (Tag & Promote to Prod)') {
      steps {
        // Create a “release” tag for the artefact (promotion concept)
        bat "docker tag ${IMAGE_STAGING} ${IMAGE_RELEASE}"
        bat "docker images | findstr student-api"

        // Run production container on different port
        powershell """
          docker stop ${PROD_NAME} 2>`$null
          docker rm ${PROD_NAME} 2>`$null

          docker run -d --name ${PROD_NAME} -p ${PROD_PORT}:${CONTAINER_PORT} ${IMAGE_RELEASE}

          docker ps | Select-String ${PROD_NAME}
        """
      }
    }

    stage('Monitoring (Prod Health Check + Alert Simulation)') {
      steps {
        powershell """
          Start-Sleep -Seconds 3
          try {
            \$resp = Invoke-RestMethod http://localhost:${PROD_PORT}/health
            Write-Host 'PROD Health Check OK:'
            \$resp | ConvertTo-Json -Compress | Write-Host
          } catch {
            Write-Host 'ALERT: PROD health check FAILED'
            exit 1
          }
        """
      }
    }
  }

  post {
    always {
      echo "Pipeline finished. Cleaning workspace is optional."
    }
    success {
      echo "SUCCESS: Build ${BUILD_NUMBER} staged and released."
    }
    failure {
      echo "FAILURE: Investigate console logs for the failing stage."
    }
  }
}
