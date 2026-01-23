pipeline {
  agent any

  stages {
    stage('Checkout') {
      steps { checkout scm }
    }

    stage('Build (Dependencies)') {
      steps { bat 'npm ci' }
    }

    stage('Test (Jest)') {
      steps { bat 'npm test' }
    }

    stage('Security (npm audit)') {
      steps { bat 'npm audit --audit-level=high || exit /b 0' }
    }

    stage('Build Artefact (Docker Image)') {
      steps { bat 'docker build -t student-api:%BUILD_NUMBER% .' }
    }

   stage('Deploy (Staging)') {
  steps {
    powershell '''
      docker stop student-api-staging 2>$null
      docker rm student-api-staging 2>$null

      # Run on 3002 to avoid conflicts with anything else using 3000
      docker run -d --name student-api-staging -p 3002:3000 student-api:$env:BUILD_NUMBER

      docker ps
    '''
  }
}

stage('Monitoring (Health Check)') {
  steps {
    powershell '''
      Start-Sleep -Seconds 3
      Invoke-RestMethod http://localhost:3002/health
    '''
  }
}

  }
}
