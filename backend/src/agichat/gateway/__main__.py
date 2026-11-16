import uvicorn

from agichat.config import Settings


def main() -> None:
    uvicorn.run(
        "agichat.gateway.app:create_app",
        factory=True,
        host="0.0.0.0",
        port=Settings().gateway_port,
    )


if __name__ == "__main__":
    main()
