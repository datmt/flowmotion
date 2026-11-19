// Test -> build image -> push cr.datmt.com/flowmotion:<commit> (arm64). Tests run inside the Dockerfile.
// Then bumps the image tag in the gitops repo (sso-secrets) so Argo deploys it. Same credentials as ukata-api.
pipeline {
    agent any
    options { disableConcurrentBuilds() }
    environment {
        DOCKERFILE = "Dockerfile"
        IMAGE_REPO = "cr.datmt.com/flowmotion"
        GITOPS_REPO = "https://github.com/datmt/sso-secrets.git"
        MANIFEST_PATH = "datmt-k3s/flowmotion/deployment.yaml"
    }
    stages {
        stage('Test, build image and push to registry') {
            steps {
                script {
                    echo "Build number ${GIT_COMMIT}"
                    docker.withRegistry('https://cr.datmt.com', 'cr-datmt-builder-credentials') {
                        def imageName = "${IMAGE_REPO}:${GIT_COMMIT}"
                        // Typecheck and unit tests run inside the Dockerfile; a failing test fails the push.
                        retry(3) {
                            sh """
                                docker buildx build \
                                --platform linux/arm64 -t ${imageName} -f ${DOCKERFILE} --push .
                            """
                        }
                    }
                }
            }
        }
        stage('Update deployment') {
            steps {
                script {
                    echo "Updating gitops repo for flowmotion @ ${GIT_COMMIT}"
                    withCredentials([usernamePassword(credentialsId: 'ukata-gitops-github-pat', usernameVariable: 'GH_USER', passwordVariable: 'GH_TOKEN')]) {
                        sh """
                            export GIT_TERMINAL_PROMPT=0
                            AUTH=\$(printf 'x-access-token:%s' "\$GH_TOKEN" | base64 | tr -d '\\n')
                            export GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.extraHeader GIT_CONFIG_VALUE_0="Authorization: Basic \$AUTH"

                            attempt=1
                            max_attempts=5
                            success=0
                            while [ \$attempt -le \$max_attempts ]; do
                                rm -rf gitops-deploy
                                git clone --depth 1 -b main ${GITOPS_REPO} gitops-deploy
                                cd gitops-deploy
                                yq -i '.spec.template.spec.containers[0].image = "${IMAGE_REPO}:${GIT_COMMIT}"' ${MANIFEST_PATH}
                                git config user.email "jenkins@datmt.com"
                                git config user.name "jenkins-bot"
                                if git diff --quiet; then echo "No manifest change, nothing to deploy"; success=1; break; fi
                                git commit -am "deploy: flowmotion ${GIT_COMMIT}"
                                if git push origin main; then
                                    success=1
                                    break
                                fi
                                cd ..
                                echo "Push attempt \$attempt failed (likely a concurrent gitops update), retrying..."
                                sleep \$((attempt * 3))
                                attempt=\$((attempt + 1))
                            done
                            if [ "\$success" -ne 1 ]; then
                                echo "Failed to push to gitops repo after \$max_attempts attempts"
                                exit 1
                            fi
                        """
                    }
                }
            }
        }
    }

    post {
        success {
            withCredentials([string(credentialsId: 'ukata-telegram-bot-token', variable: 'TELEGRAM_BOT_TOKEN')]) {
                sh 'curl -X POST -H "Content-Type: application/json" -d \'{"chat_id": "1024803686", "text": "[🔥SUCCESS] Flowmotion image pushed: ' + "${env.IMAGE_REPO}:${env.GIT_COMMIT}" + '", "disable_notification": false}\' "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"'
            }
        }
        failure {
            withCredentials([string(credentialsId: 'ukata-telegram-bot-token', variable: 'TELEGRAM_BOT_TOKEN')]) {
                sh 'curl -X POST -H "Content-Type: application/json" -d \'{"chat_id": "1024803686", "text": "[💀FAILED] Flowmotion build failed😭", "disable_notification": false}\' "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage"'
            }
        }
    }
}
