# CI/CD Practices - Detailed Rules

## GitHub CLI Usage

Scope: GitHub operations

Rule: Use `gh` CLI for all GitHub-related tasks.

**Common Operations:**

Check pull request status:

```bash
gh pr view 123
gh pr checks 123
gh pr diff 123
```

View GitHub Actions runs:

```bash
gh run list
gh run view <run-id>
gh run view <run-id> --log
```

Work with issues:

```bash
gh issue list
gh issue view 123
gh issue create --title "Bug" --body "Description"
```

Create pull requests:

```bash
gh pr create --title "Feature" --body "Description"
gh pr merge 123 --squash
```

Correct:

```bash
# Check if CI passed before merging
gh pr checks 123 --watch

# View failed workflow logs
gh run view 12345 --log-failed
```

Incorrect:

```bash
# Don't use curl for GitHub API when gh is available
curl -H "Authorization: token $TOKEN" https://api.github.com/repos/...
```

---

## Kubernetes Inspection

Scope: Kubernetes debugging and inspection

Rule: Use `kubectl` for querying Kubernetes resources.

**Common Operations:**

Find pods and services:

```bash
kubectl get pods -n <namespace>
kubectl get services -n <namespace>
kubectl get deployments -n <namespace>
```

Check pod logs:

```bash
kubectl logs <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace> --previous  # Previous container
kubectl logs <pod-name> -n <namespace> -f  # Follow logs
```

Describe resources for debugging:

```bash
kubectl describe pod <pod-name> -n <namespace>
kubectl describe service <service-name> -n <namespace>
```

Get resource details:

```bash
kubectl get pod <pod-name> -n <namespace> -o yaml
kubectl get configmap <name> -n <namespace> -o yaml
```

Correct:

```bash
# Check pod status before investigating
kubectl get pods -n production | grep my-app

# View recent logs for debugging
kubectl logs -n production deployment/my-app --tail=100
```

---

## CI Timeout Configuration

Scope: GitHub Actions and CI pipelines

Rule: Set reasonable timeouts for CI jobs.

**Guidelines:**

- Default timeout: 20 minutes for standard jobs
- Build jobs: 30 minutes maximum
- Test jobs: 20 minutes maximum
- Deploy jobs: 15 minutes maximum
- Always set explicit timeouts to prevent runaway jobs

Correct:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - run: deno install --frozen
      - run: deno task build

  test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - run: deno install --frozen
      - run: deno test --allow-all
```

Incorrect:

```yaml
jobs:
  build:
    runs-on: ubuntu-latest
    # No timeout - could run indefinitely
    steps:
      - run: deno task build
```

---

## Inspect Before Acting

Scope: All operations

Rule: Always inspect the current state before making changes.

**Before merging a PR:**

```bash
gh pr checks 123          # Ensure CI passed
gh pr diff 123            # Review changes
gh pr view 123            # Check description and reviewers
```

**Before deploying:**

```bash
kubectl get pods -n production    # Check current state
kubectl get events -n production  # Check for issues
```

**Before debugging:**

```bash
kubectl describe pod <name>  # Get pod status and events
kubectl logs <name>          # Check application logs
```

Correct:

```bash
# Full inspection before merge
gh pr checks 123 && gh pr view 123 && gh pr merge 123 --squash
```

Incorrect:

```bash
# Merging without checking CI status
gh pr merge 123 --squash
```

---

## Workflow Best Practices

Scope: CI/CD pipeline design

Rule: Follow best practices for reliable pipelines.

**Checklist:**

- [ ] All jobs have explicit timeouts
- [ ] Secrets are stored in GitHub Secrets or external vault
- [ ] Workflows use pinned action versions (e.g., `@v4`, not `@main`)
- [ ] Failed jobs have clear error messages
- [ ] Workflows support manual triggers for debugging (`workflow_dispatch`)

Correct:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch: # Allow manual triggers

jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - run: deno install --frozen
      - run: deno test --allow-all
```

---

## ArgoCD Image Updater Workflow

Scope: Kubernetes deployments with ArgoCD

Rule: Use ArgoCD Image Updater for automated image updates. Do NOT create git
commits for image tag updates - ArgoCD handles this automatically.

**How It Works:**

1. CI pushes new image to registry with tag
2. ArgoCD Image Updater detects new image
3. ArgoCD updates deployment automatically (no git commit needed)

**Annotations for ArgoCD Application:**

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: myapp=gcr.io/project/myapp
    argocd-image-updater.argoproj.io/myapp.update-strategy: semver
    argocd-image-updater.argoproj.io/myapp.allow-tags: regexp:^v[0-9]+\.[0-9]+\.[0-9]+$
```

Correct:

```yaml
# CI workflow - only push image, don't commit tag updates
- name: Push to Container Registry
  run: |
    docker build -t gcr.io/$PROJECT/myapp:$TAG .
    docker push gcr.io/$PROJECT/myapp:$TAG
```

Incorrect:

```yaml
# ❌ Don't commit image tag updates - ArgoCD handles this
- name: Update image tag in kustomization
  run: |
    sed -i "s/tag:.*/tag: $TAG/" k8s/kustomization.yaml
    git commit -am "Update image to $TAG"
    git push
```

**Benefits:**

- No git commits for every image update
- Cleaner git history
- Automatic rollback support
- Audit trail in ArgoCD

---

## GitHub Actions Runner Configuration

Scope: Self-hosted runners and resource optimization

Rule: Use appropriate runner types and resource limits for different job types.

**Runner Selection:**

```yaml
jobs:
  # Standard jobs - use ubuntu-latest
  lint:
    runs-on: ubuntu-latest
    timeout-minutes: 10

  # Build jobs - may need more resources
  build:
    runs-on: ubuntu-latest
    timeout-minutes: 30

  # Deploy jobs - may need specific access
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    environment: production
```

**Concurrency Control:**

```yaml
concurrency:
  group: ${{ github.ref }}-${{ github.workflow }}
  cancel-in-progress: true
```

**Cache Dependencies:**

```yaml
- name: Cache Go modules
  uses: actions/cache@v4
  with:
    path: ~/go/pkg/mod
    key: ${{ runner.os }}-go-${{ hashFiles('**/go.sum') }}
    restore-keys: ${{ runner.os }}-go-

- name: Cache Deno dependencies
  uses: actions/cache@v4
  with:
    path: ~/.cache/deno
    key: ${{ runner.os }}-deno-${{ hashFiles('**/deno.lock') }}
```

---

## Environment-Specific Deployments

Scope: Multi-environment deployment pipelines

Rule: Use tag patterns to determine deployment environment. Semantic versioning
tags trigger production, suffixed tags trigger staging/test.

**Tag Patterns:**

```bash
v1.0.0           # Production deployment
v1.0.0-rc.1      # Staging deployment
v1.0.0-dev.1     # Test/development deployment
```

**Workflow Implementation:**

```yaml
- name: Determine Environment
  run: |
    TAG="${GITHUB_REF#refs/tags/}"

    if [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "DEPLOY_ENV=production" >> $GITHUB_ENV
    elif [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-rc ]]; then
      echo "DEPLOY_ENV=stage" >> $GITHUB_ENV
    elif [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-dev ]]; then
      echo "DEPLOY_ENV=test" >> $GITHUB_ENV
    else
      echo "Error: Unrecognized tag format"
      exit 1
    fi
```

**Benefits:**

- Clear separation of environments
- Automatic environment detection
- Consistent deployment process
- Easy rollback by re-tagging
