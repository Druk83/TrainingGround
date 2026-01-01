#!/usr/bin/env python
"""Run tests for Template Generator.

Usage:
    python run_tests.py              # Unit tests only (for pre-commit)
    python run_tests.py --all        # All tests including integration
    python run_tests.py --integration  # Integration tests only
    python run_tests.py --performance  # Performance tests only
"""

import subprocess
import sys
from pathlib import Path


def main():
    # Get the directory where this script is located
    script_dir = Path(__file__).resolve().parent
    
    # Parse arguments
    all_tests = "--all" in sys.argv
    integration = "--integration" in sys.argv
    performance = "--performance" in sys.argv
    
    # Remove our custom args
    pytest_args = [arg for arg in sys.argv[1:] if not arg.startswith("--") or arg in ["--verbose", "--v"]]
    
    # Base command
    cmd = [
        sys.executable,
        "-m",
        "pytest",
        "tests/",
        "-v",
        "--tb=short",
    ]
    
    # Add pytest args
    cmd.extend(pytest_args)
    
    # Configure test markers
    if all_tests:
        print("Running ALL tests (unit + integration + performance)...")
        # Run all tests
    elif integration:
        print("Running INTEGRATION tests only...")
        cmd.extend(["-m", "integration"])
    elif performance:
        print("Running PERFORMANCE tests only...")
        cmd.extend(["-m", "performance"])
    else:
        print("Running UNIT tests only (for pre-commit)...")
        cmd.extend(["-m", "not (integration or performance)"])
    
    print(f"Command: {' '.join(cmd)}")
    print(f"Working directory: {script_dir}")
    print("-" * 80)
    
    result = subprocess.run(cmd, cwd=script_dir)
    return result.returncode


if __name__ == "__main__":
    sys.exit(main())

