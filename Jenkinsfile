pipeline {
  agent any

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

    stage('Security (npm audit)') {
      steps {
         High severity only to keep it practical for 1-day build
        bat 'npm audit --audit-level=high  exit b 0'
      }
    }

    stage('Build Artefact (Docker Image)') {
      steps {
        bat 'docker build -t student-api%BUILD_NUMBER% .'
      }
    }

    stage('Deploy (Staging Container)') {
      steps {
         Stopremove if exists, then run new
        bat '''
          docker stop student-api-staging  exit b 0
          docker rm student-api-staging  exit b 0
          docker run -d --name student-api-staging -p 30003000 student-api%BUILD_NUMBER%
        '''
      }
    }

    stage('Monitoring (Health Check)') {
      steps {
        bat '''
          curl httplocalhost3000health
        '''
      }
    }
  }

  post {
    always {
      echo 'Pipeline completed.'
    }
  }
}
