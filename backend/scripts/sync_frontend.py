"""Utility to copy the Lovable-generated build into the Flask app."""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def copy_tree(src: Path, dst: Path) -> None:
    if dst.exists():
        if dst.is_dir():
            shutil.rmtree(dst)
        else:
            dst.unlink()
    if src.is_dir():
        shutil.copytree(src, dst)
    else:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def sync_frontend(dist_dir: Path, templates_dir: Path, static_dir: Path) -> None:
    if not dist_dir.exists():
        raise FileNotFoundError(f"Build directory not found: {dist_dir}")

    index_file = dist_dir / "index.html"
    if not index_file.exists():
        raise FileNotFoundError(f"index.html not found in {dist_dir}")

    templates_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(index_file, templates_dir / "index.html")

    for child in dist_dir.iterdir():
        if child.name == "index.html":
            continue
        destination = static_dir / child.name
        copy_tree(child, destination)


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Copy the built frontend into the Flask static/template folders.")
    parser.add_argument(
        "--dist",
        type=Path,
        default=project_root.parent.joinpath("frontend", "dist"),
        help="Path to the frontend build output (dist)",
    )
    parser.add_argument(
        "--templates",
        type=Path,
        default=project_root.joinpath("templates"),
        help="Target templates directory",
    )
    parser.add_argument(
        "--static",
        type=Path,
        default=project_root.joinpath("static"),
        help="Target static directory",
    )

    args = parser.parse_args()
    try:
        sync_frontend(args.dist, args.templates, args.static)
        print(f"Synced build from {args.dist} into {args.templates} and {args.static}.")
    except FileNotFoundError as exc:
        print(exc)


if __name__ == "__main__":
    main()
