.DEFAULT_GOAL := help
.PHONY: help install test test-unit test-integration test-watch coverage lint scan clean smoke verify-tools verify-manifest register bootstrap unbootstrap tag release-check ci dev

# ---------- Help ----------

help:  ## Show this help message
	@echo "ai-toolkit — dev commands"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ---------- Setup ----------

install:  ## Install dependencies
	npm install

clean:  ## Remove node_modules, coverage, and tmp test artifacts
	rm -rf node_modules coverage test/fixtures/tmp /tmp/ai-toolkit-*

# ---------- Testing (TDD) ----------

test:  ## Run all tests
	node --test 'test/**/*.test.js'

test-unit:  ## Run unit tests only
	node --test 'test/unit/**/*.test.js'

test-integration:  ## Run integration tests only
	node --test 'test/integration/**/*.test.js'

test-watch:  ## Run tests in watch mode (TDD inner loop)
	node --test --watch 'test/**/*.test.js'

coverage:  ## Run tests with coverage report
	node --test --experimental-test-coverage 'test/**/*.test.js'

# ---------- Quality gates ----------

lint:  ## Static checks (syntax + basic hygiene)
	@echo "Checking for stray console.log..."
	@! grep -rn "console.log" src/ bin/ || (echo "Found console.log statements"; exit 1)
	@echo "Checking JSON files parse..."
	@node -e "JSON.parse(require('fs').readFileSync('config/tools.json'))"
	@node -e "JSON.parse(require('fs').readFileSync('manifest.json'))"
	@echo "OK"

scan:  ## Run gitleaks secret scan
	@command -v gitleaks >/dev/null 2>&1 || (echo "gitleaks not installed. Install: brew install gitleaks"; exit 1)
	gitleaks detect --source . --verbose

verify-tools:  ## Validate config/tools.json against schema
	./scripts/verify-tools.sh

register:  ## Regenerate manifest.json from asset frontmatter
	node scripts/register.js

verify-manifest:  ## Fail if manifest.json is out of date relative to asset frontmatter
	node scripts/register.js --check

bootstrap:  ## Symlink toolkit's own assets into .claude/.cursor/.github/ for self-hosting
	./scripts/bootstrap.sh

unbootstrap:  ## Remove the bootstrapped .claude/.cursor/.github/ trees
	rm -rf .claude .cursor .github

# ---------- End-to-end ----------

smoke:  ## Run smoke test in a temp directory
	./scripts/smoke-test.sh

# ---------- Release flow ----------

release-check: lint test scan verify-tools verify-manifest  ## All gates that must pass before tagging
	@echo "✓ All release checks passed"

tag:  ## Tag a new version (usage: make tag VERSION=0.1.0)
	@if [ -z "$(VERSION)" ]; then echo "Usage: make tag VERSION=0.1.0"; exit 1; fi
	npm version $(VERSION) --no-git-tag-version
	git add package.json
	git commit -m "chore: v$(VERSION)"
	git tag v$(VERSION)
	@echo "Tagged v$(VERSION). Run: git push && git push --tags"

# ---------- Composite ----------

ci: install lint test coverage scan verify-tools verify-manifest  ## Everything CI would run
	@echo "✓ CI checks passed"

dev: install  ## Set up local dev environment
	@echo "Ready. Run 'make test-watch' to start the TDD loop."
