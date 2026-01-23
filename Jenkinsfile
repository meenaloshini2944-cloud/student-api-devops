pipeline {
  agent any

  options {
    timestamps()
    disableConcurrentBuilds()
  }

  environment {
    STAGING_NAME   = "student-api-staging"
    PROD_NAME      = "student-api-prod"
    STAGING_PORT   = "3002"
    PROD_PORT      = "3003"
    CONTAINER_PORT = "3000"

    IMAGE_BUILD    = "student-api:${BUILD_NUMBER}"
    IMAGE_RELEASE  = "student-api:release-${BUILD_NUMBER}"
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

stage('Code Quality (SonarQube Scan - Docker)') {
  environment {
    SONAR_TOKEN = credentials('sonar-token')
  }
  steps {
    powershell '''
      $args = @(
        "run","--rm",
        "-e","SONAR_HOST_URL=http://host.docker.internal:9000",
        "-e","SONAR_TOKEN=$env:SONAR_TOKEN",
        "-v","$env:WORKSPACE`:/usr/src",
        "-w","/usr/src",
        "sonarsource/sonar-scanner-cli:latest",
        "-Dsonar.projectKey=Student-API-DevOps",
        "-Dsonar.projectName=Student-API-DevOps",
        "-Dsonar.sources=.",
        "-Dsonar.exclusions=**/node_modules/**,**/coverage/**",
        "-Dsonar.login=$env:SONAR_TOKEN"
      )

      & docker @args
    '''
  }
}

    stage('Security (npm audit)') {
      steps {
        bat 'npm audit --audit-level=high || exit /b 0'
      }
    }

    stage('Build Artefact (Docker Image)') {
      steps {
        bat "docker build -t ${IMAGE_BUILD} ."
        bat "docker images | findstr student-api"
      }
    }

    stage('Deploy (Staging)') {
      steps {
        powershell '''
          docker stop student-api-staging 2>$null
          docker rm student-api-staging 2>$null

          docker run -d --name student-api-staging -p 3002:3000 student-api:$env:BUILD_NUMBER

          docker ps | Select-String student-api-staging
        '''
      }
    }

    stage('Monitoring (Staging Health Check)') {
      steps {
        powershell '''
          Start-Sleep -Seconds 3
          $resp = Invoke-RestMethod http://localhost:3002/health
          Write-Host "STAGING Health:"
          $resp | ConvertTo-Json -Compress | Write-Host
        '''
      }
    }

    stage('Release (Promote to Prod)') {
      steps {
        bat "docker tag ${IMAGE_BUILD} ${IMAGE_RELEASE}"

        powershell '''
          docker stop student-api-prod 2>$null
          docker rm student-api-prod 2>$null

          docker run -d --name student-api-prod -p 3003:3000 student-api:release-$env:BUILD_NUMBER

          docker ps | Select-String student-api-prod
        '''
      }
    }

    stage('Monitoring (Prod Health Check)') {
      steps {
        powershell '''
          Start-Sleep -Seconds 3
          try {
            $resp = Invoke-RestMethod http://localhost:3003/health
            Write-Host "PROD Health:"
            $resp | ConvertTo-Json -Compress | Write-Host
          } catch {
            Write-Host "ALERT: PROD health check FAILED"
            exit 1
          }
        '''
      }
    }
  }

  post {
    always {
      echo "Pipeline completed."
    }
  }
}
