#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any


DEFAULT_OWNER = os.getenv("SMART_AGENTS_PROJECT_OWNER", "prashantsolanki3")
DEFAULT_PROJECT_NUMBER = int(os.getenv("SMART_AGENTS_PROJECT_NUMBER", "2"))
SIZE_TO_ESTIMATE = {
    "XS": 1,
    "S": 2,
    "M": 3,
    "L": 5,
    "XL": 8,
}
DEFAULT_LABEL_COLOR = "bfd4f2"


class CommandError(RuntimeError):
    pass


@dataclass
class ProjectContext:
    owner: str
    number: int
    project_id: str
    fields: list[dict[str, Any]]
    # Cached iteration field with full GraphQL configuration; lazily populated
    # because `gh project field-list` does not include configuration.iterations.
    iteration_field_cache: dict[str, Any] | None = None


def require_gh() -> None:
    if shutil.which("gh"):
        return
    raise CommandError("GitHub CLI 'gh' was not found in PATH")


def run_gh(args: list[str], *, parse_json: bool = False) -> Any:
    result = subprocess.run(
        ["gh", *args],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise CommandError(result.stderr.strip() or result.stdout.strip() or "gh command failed")
    output = result.stdout.strip()
    if not parse_json:
        return output
    if not output:
        return None
    return json.loads(output)


def normalize_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if isinstance(payload.get("items"), list):
            return payload["items"]
        if isinstance(payload.get("nodes"), list):
            return payload["nodes"]
    raise CommandError("Unsupported project item-list JSON shape")


def normalize_fields(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        if isinstance(payload.get("fields"), list):
            return payload["fields"]
        if isinstance(payload.get("nodes"), list):
            return payload["nodes"]
    raise CommandError("Unsupported project field-list JSON shape")


def normalize_project(payload: Any) -> dict[str, Any]:
    if isinstance(payload, dict) and payload.get("id"):
        return payload
    if isinstance(payload, dict) and isinstance(payload.get("project"), dict):
        return payload["project"]
    raise CommandError("Unsupported project view JSON shape")


def today_iso() -> str:
    return date.today().isoformat()


def parse_date(value: str) -> date:
    return datetime.strptime(value, "%Y-%m-%d").date()


def casefold_equals(left: str | None, right: str | None) -> bool:
    return (left or "").casefold() == (right or "").casefold()


def get_project_context(owner: str, number: int) -> ProjectContext:
    project = normalize_project(run_gh(["project", "view", str(number), "--owner", owner, "--format", "json"], parse_json=True))
    fields = normalize_fields(run_gh(["project", "field-list", str(number), "--owner", owner, "--format", "json"], parse_json=True))
    return ProjectContext(owner=owner, number=number, project_id=project["id"], fields=fields)


def get_project_items(owner: str, number: int) -> list[dict[str, Any]]:
    """Fetch all project items, following pagination via --limit with a large cap."""
    payload = run_gh(
        ["project", "item-list", str(number), "--owner", owner, "--format", "json", "--limit", "500"],
        parse_json=True,
    )
    return normalize_items(payload)


def get_issue(issue_ref: str, repo: str | None = None) -> dict[str, Any]:
    args = ["issue", "view", issue_ref, "--json", "id,number,title,url"]
    if repo:
        args.extend(["--repo", repo])
    return run_gh(args, parse_json=True)


def resolve_item_id(owner: str, project_number: int, issue_url: str) -> str:
    for item in get_project_items(owner, project_number):
        content = item.get("content") or {}
        if content.get("url") == issue_url:
            item_id = item.get("id")
            if item_id:
                return item_id
    raise CommandError(f"Project item not found for issue URL: {issue_url}")


def find_field(fields: list[dict[str, Any]], field_name: str) -> dict[str, Any]:
    for field in fields:
        if casefold_equals(field.get("name"), field_name):
            return field
    raise CommandError(f"Project field not found: {field_name}")


def find_single_select_option(field: dict[str, Any], option_name: str) -> dict[str, Any]:
    options = field.get("options") or []
    for option in options:
        if casefold_equals(option.get("name"), option_name):
            return option
    raise CommandError(f"Option '{option_name}' not found in field '{field.get('name', '')}'")


ITERATION_FIELD_GRAPHQL = (
    "query($projectId:ID!){node(id:$projectId){... on ProjectV2{"
    "fields(first:50){nodes{__typename "
    "... on ProjectV2IterationField{id name configuration{"
    "iterations{id title startDate duration} "
    "completedIterations{id title startDate duration}}}}}}}}"
)


ITERATION_FIELD_NAME = "Iteration"


def fetch_iteration_field(project_id: str) -> dict[str, Any]:
    """Fetch the project's Iteration field with its full configuration via GraphQL.

    `gh project field-list` returns iteration fields without
    `configuration.iterations`, which leaves `find_iteration` with nothing to
    match against. This helper hits GraphQL directly so the caller has the
    iteration ids and date windows.

    Selection rule: prefer the iteration field literally named ``Iteration``
    (case-insensitive). If a project ever grows multiple iteration fields
    (e.g. Sprint + Iteration), we must not silently pick the wrong one.
    """
    payload = run_gh(
        ["api", "graphql", "-f", f"query={ITERATION_FIELD_GRAPHQL}", "-F", f"projectId={project_id}"],
        parse_json=True,
    )
    nodes = (((payload or {}).get("data") or {}).get("node") or {}).get("fields", {}).get("nodes") or []
    iteration_fields = [n for n in nodes if n.get("__typename") == "ProjectV2IterationField"]
    for node in iteration_fields:
        if casefold_equals(node.get("name"), ITERATION_FIELD_NAME):
            return node
    if not iteration_fields:
        raise CommandError("No iteration field configured on project")
    available = ", ".join(repr(n.get("name")) for n in iteration_fields)
    raise CommandError(
        f"Project has iteration fields ({available}) but none is named {ITERATION_FIELD_NAME!r}"
    )


def get_iteration_field(project: ProjectContext) -> dict[str, Any]:
    if project.iteration_field_cache is None:
        project.iteration_field_cache = fetch_iteration_field(project.project_id)
    return project.iteration_field_cache


def find_iteration(field: dict[str, Any], iteration_name: str | None) -> dict[str, Any] | None:
    configuration = field.get("configuration") or {}
    iterations = list(configuration.get("iterations") or [])
    iterations.extend(configuration.get("completedIterations") or [])
    if iteration_name:
        for iteration in iterations:
            if casefold_equals(iteration.get("title"), iteration_name):
                return iteration
        raise CommandError(f"Iteration '{iteration_name}' not found")

    today = date.today()
    for iteration in iterations:
        start_date = iteration.get("startDate")
        duration = iteration.get("duration")
        if not start_date or not duration:
            continue
        start = parse_date(start_date)
        end = start + timedelta(days=int(duration) - 1)
        if start <= today <= end:
            return iteration
    return None


def iteration_target_date(iteration: dict[str, Any] | None) -> str | None:
    if not iteration:
        return None
    start_date = iteration.get("startDate")
    duration = iteration.get("duration")
    if not start_date or not duration:
        return None
    end = parse_date(start_date) + timedelta(days=int(duration) - 1)
    return end.isoformat()


def ensure_labels(repo: str, labels: list[str]) -> list[str]:
    if not labels:
        return []
    existing = run_gh(["label", "list", "--repo", repo, "--limit", "200", "--json", "name"], parse_json=True)
    existing_names = {label["name"] for label in existing}
    created: list[str] = []
    for label in labels:
        if label in existing_names:
            continue
        description = "Smart Agents project label"
        if label.startswith("initiative:"):
            description = "Smart Agents initiative label"
        elif label.startswith("repo:"):
            description = "Smart Agents repository scope label"
        elif label.startswith("type:"):
            description = "Smart Agents work type label"
        run_gh([
            "label",
            "create",
            label,
            "--repo",
            repo,
            "--color",
            DEFAULT_LABEL_COLOR,
            "--description",
            description,
        ])
        created.append(label)
    return created


def create_issue(
    *,
    repo: str,
    title: str,
    body: str | None,
    body_file: str | None,
    labels: list[str],
    assignees: list[str],
) -> dict[str, Any]:
    args = ["issue", "create", "--repo", repo, "--title", title]
    if body_file:
        args.extend(["--body-file", body_file])
    else:
        args.extend(["--body", body or ""])
    for label in labels:
        args.extend(["--label", label])
    for assignee in assignees:
        args.extend(["--assignee", assignee])
    issue_url = run_gh(args)
    return get_issue(issue_url)


def add_issue_to_project(project_id: str, issue_node_id: str) -> str:
    """Add an issue to a project via GraphQL and return the project item ID."""
    result = run_gh(
        [
            "api",
            "graphql",
            "-f",
            "query=mutation($projectId:ID!, $contentId:ID!) { addProjectV2ItemById(input:{projectId:$projectId, contentId:$contentId}) { item { id } } }",
            "-F",
            f"projectId={project_id}",
            "-F",
            f"contentId={issue_node_id}",
        ],
        parse_json=True,
    )
    try:
        return result["data"]["addProjectV2ItemById"]["item"]["id"]
    except (KeyError, TypeError) as exc:
        raise CommandError(f"Unexpected addProjectV2ItemById response: {result}") from exc


def set_single_select_field(project: ProjectContext, item_id: str, field_name: str, option_name: str) -> None:
    field = find_field(project.fields, field_name)
    option = find_single_select_option(field, option_name)
    run_gh([
        "project",
        "item-edit",
        "--id",
        item_id,
        "--project-id",
        project.project_id,
        "--field-id",
        field["id"],
        "--single-select-option-id",
        option["id"],
    ])


def set_number_field(project: ProjectContext, item_id: str, field_name: str, number: int) -> None:
    field = find_field(project.fields, field_name)
    run_gh([
        "project",
        "item-edit",
        "--id",
        item_id,
        "--project-id",
        project.project_id,
        "--field-id",
        field["id"],
        "--number",
        str(number),
    ])


def set_date_field(project: ProjectContext, item_id: str, field_name: str, value: str) -> None:
    field = find_field(project.fields, field_name)
    run_gh([
        "project",
        "item-edit",
        "--id",
        item_id,
        "--project-id",
        project.project_id,
        "--field-id",
        field["id"],
        "--date",
        value,
    ])


def set_iteration_field(project: ProjectContext, item_id: str, iteration_name: str | None) -> tuple[dict[str, Any] | None, str | None]:
    """Apply the Iteration field on a project item.

    Returns ``(iteration, target_date)`` where ``iteration`` is the resolved
    iteration dict (or ``None`` if no current iteration matched and no name was
    given) and ``target_date`` is the iteration's last day. Callers should only
    record ``Iteration`` as applied when the returned iteration is non-None.
    """
    field = get_iteration_field(project)
    iteration = find_iteration(field, iteration_name)
    if not iteration:
        return None, None
    run_gh([
        "project",
        "item-edit",
        "--id",
        item_id,
        "--project-id",
        project.project_id,
        "--field-id",
        field["id"],
        "--iteration-id",
        iteration["id"],
    ])
    return iteration, iteration_target_date(iteration)


def link_sub_issue(parent_repo: str, parent_number: str, child_repo: str, child_number: str) -> dict[str, Any]:
    parent = get_issue(parent_number, repo=parent_repo)
    child = get_issue(child_number, repo=child_repo)
    run_gh([
        "api",
        "graphql",
        "-f",
        "query=mutation($issueId:ID!, $subIssueId:ID!) { addSubIssue(input:{issueId:$issueId, subIssueId:$subIssueId}) { issue { id } } }",
        "-F",
        f"issueId={parent['id']}",
        "-F",
        f"subIssueId={child['id']}",
    ])
    return {
        "parent": {"repo": parent_repo, "number": parent["number"], "url": parent["url"]},
        "child": {"repo": child_repo, "number": child["number"], "url": child["url"]},
    }


def resolve_issue(args: argparse.Namespace, *, url_attr: str, repo_attr: str, number_attr: str) -> dict[str, Any]:
    """Resolve an issue node from either a URL or a repo+number pair.

    Mirrors the dual-input style the rest of the script uses for project items.
    """
    issue_url = getattr(args, url_attr, None)
    repo = getattr(args, repo_attr, None)
    number = getattr(args, number_attr, None)
    if issue_url:
        return get_issue(issue_url)
    if repo and number:
        return get_issue(str(number), repo=repo)
    raise CommandError(f"Provide either --{url_attr.replace('_', '-')} or --{repo_attr.replace('_', '-')} + --{number_attr.replace('_', '-')}")


_ALREADY_BLOCKED_PHRASES = (
    # GitHub validation message when the edge already exists, observed 2026-05-06:
    # "Validation failed: Target issue has already been taken"
    "target issue has already been taken",
    # Defensive fallback if GitHub reorders the message in future revisions.
    "already blocked by",
    "already a dependency",
)


def _is_duplicate_dependency_error(message: str) -> bool:
    lower = message.lower()
    return any(phrase in lower for phrase in _ALREADY_BLOCKED_PHRASES)


def add_blocked_by(blocked_id: str, blocking_id: str) -> dict[str, Any]:
    """Idempotently mark `blocked_id` as blocked by `blocking_id`.

    GitHub returns a VALIDATION error when the edge already exists; we treat
    that specific case as success so the script is safe to rerun. Any other
    failure (auth, missing issue, transient 5xx) still raises.
    """
    mutation = (
        "mutation($iid:ID!,$bid:ID!){addBlockedBy(input:{issueId:$iid,blockingIssueId:$bid})"
        "{issue{number url} blockingIssue{number url}}}"
    )
    try:
        payload = run_gh(
            ["api", "graphql", "-f", f"query={mutation}", "-F", f"iid={blocked_id}", "-F", f"bid={blocking_id}"],
            parse_json=True,
        )
        result = (payload or {}).get("data", {}).get("addBlockedBy", {})
        return {"created": True, "issue": result.get("issue"), "blocking": result.get("blockingIssue")}
    except CommandError as exc:
        if _is_duplicate_dependency_error(str(exc)):
            return {"created": False, "reason": "already-exists"}
        raise


def remove_blocked_by(blocked_id: str, blocking_id: str) -> dict[str, Any]:
    mutation = (
        "mutation($iid:ID!,$bid:ID!){removeBlockedBy(input:{issueId:$iid,blockingIssueId:$bid})"
        "{issue{number url} blockingIssue{number url}}}"
    )
    payload = run_gh(
        ["api", "graphql", "-f", f"query={mutation}", "-F", f"iid={blocked_id}", "-F", f"bid={blocking_id}"],
        parse_json=True,
    )
    result = (payload or {}).get("data", {}).get("removeBlockedBy", {})
    return {"removed": True, "issue": result.get("issue"), "blocking": result.get("blockingIssue")}


def list_dependencies(issue_id: str) -> dict[str, Any]:
    query = (
        "query($id:ID!){node(id:$id){... on Issue{number url title "
        "blockedBy(first:50){nodes{number url title repository{nameWithOwner}}} "
        "blocking(first:50){nodes{number url title repository{nameWithOwner}}}}}}"
    )
    payload = run_gh(
        ["api", "graphql", "-f", f"query={query}", "-F", f"id={issue_id}"],
        parse_json=True,
    )
    issue = ((payload or {}).get("data") or {}).get("node") or {}
    return {
        "issue": {"number": issue.get("number"), "url": issue.get("url"), "title": issue.get("title")},
        "blocked_by": (issue.get("blockedBy") or {}).get("nodes") or [],
        "blocking": (issue.get("blocking") or {}).get("nodes") or [],
    }


def print_output(payload: dict[str, Any], output_format: str) -> None:
    if output_format == "json":
        json.dump(payload, sys.stdout, indent=2)
        sys.stdout.write("\n")
        return
    for key, value in payload.items():
        if isinstance(value, (dict, list)):
            print(f"{key}: {json.dumps(value, indent=2)}")
        else:
            print(f"{key}: {value}")


def command_list_items(args: argparse.Namespace) -> int:
    items = get_project_items(args.owner, args.project_number)
    if args.issue_url:
        items = [item for item in items if (item.get("content") or {}).get("url") == args.issue_url]
    payload = {"owner": args.owner, "project_number": args.project_number, "items": items}
    print_output(payload, args.output)
    return 0


def command_list_fields(args: argparse.Namespace) -> int:
    project = get_project_context(args.owner, args.project_number)
    payload = {
        "owner": project.owner,
        "project_number": project.number,
        "project_id": project.project_id,
        "fields": project.fields,
    }
    print_output(payload, args.output)
    return 0


def command_create_task(args: argparse.Namespace) -> int:
    project = get_project_context(args.owner, args.project_number)
    labels = list(args.label or [])
    created_labels = ensure_labels(args.repo, labels) if args.ensure_labels else []
    issue = create_issue(
        repo=args.repo,
        title=args.title,
        body=args.body,
        body_file=args.body_file,
        labels=labels,
        assignees=args.assignee or [],
    )
    item_id = add_issue_to_project(project.project_id, issue["id"])

    applied_fields: dict[str, Any] = {}
    if args.apply_defaults:
        status_name = args.status or "Todo"
        team_name = args.team or "Engineering"
        priority_name = args.priority or "P1"
        size_name = args.size or "M"
        estimate_value = args.estimate if args.estimate is not None else SIZE_TO_ESTIMATE.get(size_name.upper())
        start_date = args.start_date or today_iso()

        set_single_select_field(project, item_id, "Status", status_name)
        set_single_select_field(project, item_id, "Team", team_name)
        set_single_select_field(project, item_id, "Priority", priority_name)
        set_single_select_field(project, item_id, "Size", size_name)
        applied_fields.update({
            "Status": status_name,
            "Team": team_name,
            "Priority": priority_name,
            "Size": size_name,
        })

        if estimate_value is not None:
            set_number_field(project, item_id, "Estimate", int(estimate_value))
            applied_fields["Estimate"] = int(estimate_value)

        iteration, iteration_target = set_iteration_field(project, item_id, args.iteration)
        if iteration is not None:
            applied_fields["Iteration"] = iteration["title"]

        set_date_field(project, item_id, "Start date", start_date)
        applied_fields["Start date"] = start_date

        target_date = args.target_date or iteration_target
        if target_date:
            set_date_field(project, item_id, "Target date", target_date)
            applied_fields["Target date"] = target_date

    relation = None
    if args.parent_repo and args.parent_number:
        relation = link_sub_issue(args.parent_repo, args.parent_number, args.repo, str(issue["number"]))

    payload = {
        "owner": args.owner,
        "project_number": args.project_number,
        "repo": args.repo,
        "issue": issue,
        "item_id": item_id,
        "created_labels": created_labels,
        "applied_project_fields": applied_fields,
        "relation": relation,
    }
    print_output(payload, args.output)
    return 0


def command_set_fields(args: argparse.Namespace) -> int:
    project = get_project_context(args.owner, args.project_number)
    item_id = args.item_id
    if not item_id:
        if not args.issue_url:
            raise CommandError("Provide either --item-id or --issue-url")
        item_id = resolve_item_id(args.owner, args.project_number, args.issue_url)

    applied_fields: dict[str, Any] = {}
    if args.status:
        set_single_select_field(project, item_id, "Status", args.status)
        applied_fields["Status"] = args.status
    if args.team:
        set_single_select_field(project, item_id, "Team", args.team)
        applied_fields["Team"] = args.team
    if args.priority:
        set_single_select_field(project, item_id, "Priority", args.priority)
        applied_fields["Priority"] = args.priority
    if args.size:
        set_single_select_field(project, item_id, "Size", args.size)
        applied_fields["Size"] = args.size
    if args.estimate is not None:
        set_number_field(project, item_id, "Estimate", args.estimate)
        applied_fields["Estimate"] = args.estimate
    elif args.size and args.estimate_from_size:
        estimate_value = SIZE_TO_ESTIMATE.get(args.size.upper())
        if estimate_value is not None:
            set_number_field(project, item_id, "Estimate", estimate_value)
            applied_fields["Estimate"] = estimate_value
    if args.iteration_current:
        iteration, iteration_target = set_iteration_field(project, item_id, None)
        if iteration is not None:
            applied_fields["Iteration"] = iteration["title"]
            if iteration_target and not args.target_date:
                args.target_date = iteration_target
    elif args.iteration:
        iteration, _ = set_iteration_field(project, item_id, args.iteration)
        if iteration is not None:
            applied_fields["Iteration"] = iteration["title"]
    if args.start_date:
        set_date_field(project, item_id, "Start date", args.start_date)
        applied_fields["Start date"] = args.start_date
    if args.target_date:
        set_date_field(project, item_id, "Target date", args.target_date)
        applied_fields["Target date"] = args.target_date

    payload = {
        "owner": args.owner,
        "project_number": args.project_number,
        "item_id": item_id,
        "applied_project_fields": applied_fields,
    }
    print_output(payload, args.output)
    return 0


def command_link_sub_issue(args: argparse.Namespace) -> int:
    payload = link_sub_issue(args.parent_repo, args.parent_number, args.child_repo, args.child_number)
    print_output(payload, args.output)
    return 0


def command_add_dependency(args: argparse.Namespace) -> int:
    blocked = resolve_issue(args, url_attr="issue_url", repo_attr="repo", number_attr="number")
    blocking = resolve_issue(args, url_attr="blocked_by_url", repo_attr="blocked_by_repo", number_attr="blocked_by_number")
    result = add_blocked_by(blocked["id"], blocking["id"])
    payload = {
        "blocked": {"number": blocked["number"], "url": blocked["url"]},
        "blocking": {"number": blocking["number"], "url": blocking["url"]},
        "result": result,
    }
    print_output(payload, args.output)
    return 0


def command_remove_dependency(args: argparse.Namespace) -> int:
    blocked = resolve_issue(args, url_attr="issue_url", repo_attr="repo", number_attr="number")
    blocking = resolve_issue(args, url_attr="blocked_by_url", repo_attr="blocked_by_repo", number_attr="blocked_by_number")
    result = remove_blocked_by(blocked["id"], blocking["id"])
    payload = {
        "blocked": {"number": blocked["number"], "url": blocked["url"]},
        "blocking": {"number": blocking["number"], "url": blocking["url"]},
        "result": result,
    }
    print_output(payload, args.output)
    return 0


def command_list_dependencies(args: argparse.Namespace) -> int:
    targets = list(args.issue_url or [])
    pairs = list(zip(args.repo or [], args.number or []))
    if len(args.repo or []) != len(args.number or []):
        raise CommandError("--repo and --number must be paired (same count, in order)")
    targets.extend(f"{r}#{n}" for r, n in pairs)
    if not targets:
        raise CommandError("Provide --issue-url (repeatable) or --repo + --number (repeatable, paired)")

    items: list[dict[str, Any]] = []
    for target in targets:
        if "#" in target and not target.startswith("http"):
            repo, number = target.split("#", 1)
            issue = get_issue(number, repo=repo)
        else:
            issue = get_issue(target)
        items.append(list_dependencies(issue["id"]))

    if len(items) == 1:
        print_output(items[0], args.output)
    else:
        print_output({"count": len(items), "items": items}, args.output)
    return 0


def build_parser() -> argparse.ArgumentParser:
    # Shared parent carries global flags so they are accepted both before and after the subcommand name.
    shared = argparse.ArgumentParser(add_help=False)
    shared.add_argument("--owner", default=DEFAULT_OWNER, help="GitHub project owner")
    shared.add_argument("--project-number", default=DEFAULT_PROJECT_NUMBER, type=int, help="GitHub project number")
    shared.add_argument("--output", choices=["json", "text"], default="json", help="Output format")

    parser = argparse.ArgumentParser(
        description="Automate GitHub Project issue and item management for Smart Agents.",
        parents=[shared],
    )

    subparsers = parser.add_subparsers(dest="command", required=True)

    list_items = subparsers.add_parser("list-items", parents=[shared], help="List items in a GitHub project")
    list_items.add_argument("--issue-url", help="Filter to a single issue URL")
    list_items.set_defaults(func=command_list_items)

    list_fields = subparsers.add_parser("list-fields", parents=[shared], help="List project fields and options")
    list_fields.set_defaults(func=command_list_fields)

    create_task = subparsers.add_parser("create-task", parents=[shared], help="Create an issue, add it to the project, and set project fields")
    create_task.add_argument("--repo", required=True, help="Target repository in owner/repo form")
    create_task.add_argument("--title", required=True, help="Issue title")
    body_group = create_task.add_mutually_exclusive_group()
    body_group.add_argument("--body", help="Inline issue body")
    body_group.add_argument("--body-file", help="Path to issue body markdown file")
    create_task.add_argument("--label", action="append", default=[], help="Issue label, repeat for multiple labels")
    create_task.add_argument("--assignee", action="append", default=[], help="Issue assignee, repeat for multiple assignees")
    create_task.add_argument("--ensure-labels", action="store_true", help="Create missing labels before creating the issue")
    create_task.add_argument("--no-defaults", dest="apply_defaults", action="store_false", default=True, help="Skip applying default Smart Agents project fields")
    create_task.add_argument("--status", help="Project Status option name")
    create_task.add_argument("--team", help="Project Team option name")
    create_task.add_argument("--priority", help="Project Priority option name")
    create_task.add_argument("--size", help="Project Size option name")
    create_task.add_argument("--estimate", type=int, help="Project Estimate numeric value")
    create_task.add_argument("--iteration", help="Iteration title; defaults to the current active iteration")
    create_task.add_argument("--start-date", help="Start date in YYYY-MM-DD format")
    create_task.add_argument("--target-date", help="Target date in YYYY-MM-DD format")
    create_task.add_argument("--parent-repo", help="Parent issue repository for creating a native sub-issue link")
    create_task.add_argument("--parent-number", help="Parent issue number for creating a native sub-issue link")
    create_task.set_defaults(func=command_create_task)

    set_fields = subparsers.add_parser("set-fields", parents=[shared], help="Update GitHub project fields for an existing item")
    set_fields.add_argument("--item-id", help="Project item id")
    set_fields.add_argument("--issue-url", help="Issue URL to resolve the project item id")
    set_fields.add_argument("--status", help="Project Status option name")
    set_fields.add_argument("--team", help="Project Team option name")
    set_fields.add_argument("--priority", help="Project Priority option name")
    set_fields.add_argument("--size", help="Project Size option name")
    set_fields.add_argument("--estimate", type=int, help="Project Estimate numeric value")
    set_fields.add_argument("--estimate-from-size", action="store_true", help="Populate Estimate from the Smart Agents size mapping")
    set_fields.add_argument("--iteration", help="Iteration title")
    set_fields.add_argument("--iteration-current", action="store_true", help="Use the current active iteration")
    set_fields.add_argument("--start-date", help="Start date in YYYY-MM-DD format")
    set_fields.add_argument("--target-date", help="Target date in YYYY-MM-DD format")
    set_fields.set_defaults(func=command_set_fields)

    link_issue = subparsers.add_parser("link-sub-issue", parents=[shared], help="Create a native GitHub sub-issue relation")
    link_issue.add_argument("--parent-repo", required=True, help="Parent repository in owner/repo form")
    link_issue.add_argument("--parent-number", required=True, help="Parent issue number")
    link_issue.add_argument("--child-repo", required=True, help="Child repository in owner/repo form")
    link_issue.add_argument("--child-number", required=True, help="Child issue number")
    link_issue.set_defaults(func=command_link_sub_issue)

    add_dep = subparsers.add_parser("add-dependency", parents=[shared], help="Mark an issue as blocked by another (idempotent)")
    add_dep.add_argument("--issue-url", help="URL of the issue that becomes blocked")
    add_dep.add_argument("--repo", help="Repo of the blocked issue (owner/repo)")
    add_dep.add_argument("--number", help="Number of the blocked issue")
    add_dep.add_argument("--blocked-by-url", help="URL of the blocking issue")
    add_dep.add_argument("--blocked-by-repo", help="Repo of the blocking issue (owner/repo)")
    add_dep.add_argument("--blocked-by-number", help="Number of the blocking issue")
    add_dep.set_defaults(func=command_add_dependency)

    remove_dep = subparsers.add_parser("remove-dependency", parents=[shared], help="Remove a blocked-by relationship")
    remove_dep.add_argument("--issue-url", help="URL of the blocked issue")
    remove_dep.add_argument("--repo", help="Repo of the blocked issue (owner/repo)")
    remove_dep.add_argument("--number", help="Number of the blocked issue")
    remove_dep.add_argument("--blocked-by-url", help="URL of the blocking issue")
    remove_dep.add_argument("--blocked-by-repo", help="Repo of the blocking issue (owner/repo)")
    remove_dep.add_argument("--blocked-by-number", help="Number of the blocking issue")
    remove_dep.set_defaults(func=command_remove_dependency)

    list_deps = subparsers.add_parser("list-dependencies", parents=[shared], help="List blocked-by and blocking edges for one or more issues")
    list_deps.add_argument("--issue-url", action="append", default=[], help="Issue URL (repeat for multiple)")
    list_deps.add_argument("--repo", action="append", default=[], help="Repo (owner/repo); pair with --number, repeat for multiple")
    list_deps.add_argument("--number", action="append", default=[], help="Issue number; pair with --repo, repeat for multiple")
    list_deps.set_defaults(func=command_list_dependencies)

    return parser


def main() -> int:
    require_gh()
    parser = build_parser()
    args = parser.parse_args()
    try:
        return args.func(args)
    except CommandError as exc:
        error_payload = {"error": str(exc)}
        json.dump(error_payload, sys.stderr, indent=2)
        sys.stderr.write("\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())