# Deployments

Deploying services built with eserstack to Kubernetes with ArgoCD. Publishing
the packages themselves is release-process.md.

---

## Inspect the Cluster Before Acting

Scope: Kubernetes debugging and deployments

Rule: Look before changing anything, with read-only commands, and name the
namespace every time:

```bash
kubectl get pods -n <namespace>
kubectl describe pod <pod> -n <namespace>
kubectl logs deployment/<app> -n <namespace> --tail=100
kubectl get events -n <namespace> --sort-by=.lastTimestamp
```

A change to a running cluster (apply, delete, scale, restart) is an action the
user confirms first. ConfigMaps and Secrets are synced from env files with
`@eserstack/cs`, not edited by hand.

---

## Image Updates Go Through ArgoCD Image Updater

Scope: Services deployed with ArgoCD

Rule: CI builds and pushes a tagged image and stops there. ArgoCD Image Updater
notices the new tag and rolls it out. CI never commits image tag changes to the
manifests.

```yaml
metadata:
  annotations:
    argocd-image-updater.argoproj.io/image-list: myapp=ghcr.io/owner/myapp
    argocd-image-updater.argoproj.io/myapp.update-strategy: semver
    argocd-image-updater.argoproj.io/myapp.allow-tags: regexp:^v[0-9]+\.[0-9]+\.[0-9]+$
```

Incorrect:

```yaml
- name: Update image tag
  run: |
    sed -i "s/tag:.*/tag: $TAG/" k8s/kustomization.yaml
    git commit -am "Update image to $TAG" && git push
```

**Why:** a commit per image update floods the history and races with other
pushes; the updater keeps the audit trail in ArgoCD and supports rollback.

---

## Environment From the Tag

Scope: Pipelines that deploy to several environments

Rule: The tag decides the environment. A plain version tag deploys to
production, an `-rc` suffix to staging and a `-dev` suffix to test. Any other
tag fails the job instead of guessing.

```bash
TAG="${GITHUB_REF#refs/tags/}"
if [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "DEPLOY_ENV=production" >> "$GITHUB_ENV"
elif [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-rc ]]; then
  echo "DEPLOY_ENV=stage" >> "$GITHUB_ENV"
elif [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+-dev ]]; then
  echo "DEPLOY_ENV=test" >> "$GITHUB_ENV"
else
  echo "unrecognized tag format: $TAG" >&2
  exit 1
fi
```
