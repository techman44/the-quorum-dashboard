"""Generic runner for Quorum agents.

Usage:
    python agents/runner.py connector
    python agents/runner.py executor --since 24h
    python agents/runner.py strategist --type weekly
    python agents/runner.py closer --since 24h
    python agents/runner.py data_collector /path/to/file.txt
"""

import argparse
import logging
import sys

logger = logging.getLogger("quorum.runner")

# Registry of agent names to their classes and any special CLI handling.
AGENT_REGISTRY = {
    "connector": "agents.connector.ConnectorAgent",
    "executor": "agents.executor.ExecutorAgent",
    "strategist": "agents.strategist.StrategistAgent",
    "devils_advocate": "agents.devils_advocate.DevilsAdvocateAgent",
    "opportunist": "agents.opportunist.OpportunistAgent",
    "data_collector": "agents.data_collector.DataCollectorAgent",
    "closer": "agents.closer.CloserAgent",
}


def _import_class(dotted_path: str):
    """Dynamically import a class from a dotted module path."""
    module_path, class_name = dotted_path.rsplit(".", 1)
    import importlib

    module = importlib.import_module(module_path)
    return getattr(module, class_name)


def _parse_since(value: str) -> int:
    """Parse a human-readable duration string into hours."""
    value = value.strip().lower()
    if value.endswith("h"):
        return int(value[:-1])
    if value.endswith("d"):
        return int(value[:-1]) * 24
    return int(value)


def main():
    parser = argparse.ArgumentParser(
        description="Run a Quorum agent by name.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="Available agents: " + ", ".join(sorted(AGENT_REGISTRY.keys())),
    )
    parser.add_argument(
        "agent",
        choices=sorted(AGENT_REGISTRY.keys()),
        help="Name of the agent to run.",
    )
    parser.add_argument(
        "--since",
        type=str,
        default=None,
        help="Lookback window for agents that support it (e.g. '24h', '7d').",
    )
    parser.add_argument(
        "--type",
        dest="reflection_type",
        choices=["daily", "weekly"],
        default=None,
        help="Reflection type for the strategist agent.",
    )
    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="Logging level (default: INFO).",
    )
    parser.add_argument(
        "extra_args",
        nargs="*",
        help="Additional positional arguments (e.g. file path for data_collector).",
    )

    args = parser.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )

    agent_name = args.agent
    class_path = AGENT_REGISTRY[agent_name]
    agent_class = _import_class(class_path)

    # Build agent with appropriate kwargs based on the agent type.
    kwargs = {}

    if agent_name == "executor" and args.since:
        kwargs["lookback_hours"] = _parse_since(args.since)
    elif agent_name == "devils_advocate" and args.since:
        kwargs["lookback_hours"] = _parse_since(args.since)
    elif agent_name == "opportunist" and args.since:
        kwargs["lookback_hours"] = _parse_since(args.since)
    elif agent_name == "closer" and args.since:
        kwargs["lookback_hours"] = _parse_since(args.since)
    elif agent_name == "strategist" and args.reflection_type:
        kwargs["reflection_type"] = args.reflection_type

    agent = agent_class(**kwargs)

    # Special handling for data_collector with a file argument.
    if agent_name == "data_collector" and args.extra_args:
        from agents.data_collector import ingest_file
        for file_path in args.extra_args:
            ingest_file(file_path)
        return

    agent.execute()


if __name__ == "__main__":
    main()
