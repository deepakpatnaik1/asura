# Safe Git Merge Workflow

## Goal
Merge feature branch to main without breaking anything.

## Steps

### 1. Commit changes on feature branch
```bash
git add .
git commit -m "descriptive message"
```

### 2. Switch to main and create backup
```bash
git checkout main
git branch backup-main
```

### 3. Merge with no-fast-forward
```bash
git merge feature-branch-name --no-ff
```

### 4. If problems occur

**Abort before committing:**
```bash
git merge --abort
```

**Undo after committing:**
```bash
git reset --hard HEAD~1
```

**Restore from backup (nuclear option):**
```bash
git checkout backup-main
git branch -D main
git branch -m main
```

## Why This Works

- `--no-ff`: Creates explicit merge commit → easy to undo with single `reset`
- `backup-main`: Safety net if merge breaks main
- Merge commit preserves complete feature branch history
- Single `reset --hard HEAD~1` removes entire merge atomically

## Alternative: Test Before Merging

```bash
# On feature branch
git add . && git commit -m "message"

# Test thoroughly here

# Then merge
git checkout main
git merge feature-branch-name --no-ff
```

## Cleanup After Successful Merge

```bash
git branch -d feature-branch-name  # Delete feature branch
git branch -D backup-main          # Delete backup
```
