// EventTix CI/CD pipeline.
// Stages: Build, Test, Code Quality, Security, Deploy, Release, Monitoring (added one at a time).

pipeline {
  agent any

  options {
    timestamps()
    ansiColor('xterm')
    timeout(time: 30, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '20'))
  }

  // Build trigger: check GitHub for new commits about every 2 minutes.
  triggers {
    pollSCM('H/2 * * * *')
  }

  environment {
    BACKEND_IMAGE  = 'eventtix-backend'
    FRONTEND_IMAGE = 'eventtix-frontend'
    CI_NETWORK     = 'eventtix-ci'
    SONAR_HOST_URL    = 'http://sonarqube:9000'    // address inside the Docker network
    SONAR_PUBLIC_URL  = 'http://localhost:9000'    // address you open in a browser
    SONAR_PROJECT_KEY = 'eventtix'
    TRIVY_IMAGE       = 'aquasec/trivy:0.74.0'     // pinned exact version, never "latest"
    PG_CONTAINER   = "pg-test-${env.BUILD_NUMBER}"
  }

  stages {

    // ------------------------------------------------------------------
    // 1. BUILD: package backend and frontend as versioned Docker images.
    // ------------------------------------------------------------------
    stage('Build') {
      steps {
        script {
          env.APP_VERSION = sh(
            script: "node -p \"require('./backend/package.json').version\"",
            returnStdout: true
          ).trim()
          env.GIT_SHORT = env.GIT_COMMIT.take(7)
          env.IMAGE_TAG = "${env.APP_VERSION}.${env.BUILD_NUMBER}"
          currentBuild.displayName = "#${env.BUILD_NUMBER} v${env.IMAGE_TAG}"
        }

        echo "Building version ${env.IMAGE_TAG} from commit ${env.GIT_SHORT}"

        sh '''
          docker build --pull \
            --tag "$BACKEND_IMAGE:$IMAGE_TAG" \
            --build-arg APP_VERSION="$APP_VERSION" \
            --build-arg BUILD_NUMBER="$BUILD_NUMBER" \
            --build-arg GIT_COMMIT="$GIT_SHORT" \
            backend

          docker build --pull \
            --tag "$FRONTEND_IMAGE:$IMAGE_TAG" \
            --build-arg APP_VERSION="$APP_VERSION" \
            frontend

          {
            echo "version=$IMAGE_TAG"
            echo "commit=$GIT_COMMIT"
            echo "built=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
            echo "backend_image=$BACKEND_IMAGE:$IMAGE_TAG"
            echo "frontend_image=$FRONTEND_IMAGE:$IMAGE_TAG"
          } > build-info.txt

          docker images --filter "reference=eventtix-*:$IMAGE_TAG"
        '''

        archiveArtifacts artifacts: 'build-info.txt', fingerprint: true
      }
    }

    // ------------------------------------------------------------------
    // 2. TEST: unit + integration tests against a throwaway PostgreSQL.
    //    A failing test, or coverage under 80%, stops the pipeline.
    // ------------------------------------------------------------------
    stage('Test') {
      steps {
        dir('backend') {
          sh 'npm ci --no-audit --no-fund'
          sh '''
            set -e
            docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true
            docker run -d --name "$PG_CONTAINER" --network "$CI_NETWORK" \
              -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16-alpine >/dev/null

            for i in $(seq 1 30); do
              docker exec "$PG_CONTAINER" pg_isready -h 127.0.0.1 -U postgres >/dev/null 2>&1 && break
              sleep 1
            done
            docker exec "$PG_CONTAINER" pg_isready -h 127.0.0.1 -U postgres

            export TEST_DATABASE_URL="postgres://postgres@$PG_CONTAINER:5432/postgres"
            npm run test:coverage
          '''
        }
      }
      post {
        always {
          junit allowEmptyResults: true, testResults: 'backend/reports/junit.xml'
          recordCoverage(
            tools: [[parser: 'COBERTURA', pattern: 'backend/coverage/cobertura-coverage.xml']],
            sourceCodeRetention: 'NEVER'
          )
          sh 'docker rm -f "$PG_CONTAINER" >/dev/null 2>&1 || true'
        }
      }
    }

    // ------------------------------------------------------------------
    // 3. CODE QUALITY: front end checks, then SonarQube analysis with a
    //    quality gate. The build fails if the gate fails.
    // ------------------------------------------------------------------
    stage('Code Quality') {
      steps {
        // Quick checks on the web app: types, then lint (style and common mistakes).
        dir('frontend') {
          sh 'npm ci --no-audit --no-fund'
          sh 'npm run typecheck'
          sh 'npm run lint'
        }

        withCredentials([string(credentialsId: 'sonar-token', variable: 'SONAR_TOKEN')]) {
          // Create the project and quality gate in SonarQube if needed (gate as code).
          sh 'sh scripts/sonar-setup.sh'

          // Jest writes coverage paths relative to backend/. SonarQube needs them from the repository root.
          sh '''
            sed 's#^SF:#SF:backend/#' backend/coverage/lcov.info > backend/coverage/lcov-root.info
            npx --yes @sonar/scan@5.0.0 \
              -Dsonar.host.url="$SONAR_HOST_URL" \
              -Dsonar.projectVersion="$IMAGE_TAG" \
              -Dsonar.scm.revision="$GIT_COMMIT"
          '''

          // Wait for the result and fail the build if the quality gate fails.
          sh 'sh scripts/sonar-quality-gate.sh'
        }
      }
    }

    // ------------------------------------------------------------------
    // 4. SECURITY: scan dependencies, the built images and the source code.
    //    High or critical findings that can be fixed fail the build, unless they
    //    are accepted in writing in security/accepted-risks.json.
    // ------------------------------------------------------------------
    stage('Security') {
      steps {
        sh 'sh scripts/security-scan.sh'
        sh 'node scripts/security-gate.js'
      }
      post {
        always {
          archiveArtifacts artifacts: 'security-reports/**', allowEmptyArchive: true
        }
      }
    }
  }

  post {
    success {
      echo "Pipeline succeeded: version ${env.IMAGE_TAG}"
    }
    failure {
      echo "Pipeline FAILED at build #${env.BUILD_NUMBER}. Check the stage that is red."
    }
    always {
      sh 'docker image prune -f >/dev/null 2>&1 || true'
    }
  }
}
