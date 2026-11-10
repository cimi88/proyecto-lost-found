from fastapi import FastAPI, HTTPException, Request

app = FastAPI()

ADMIN_ID = "11111111-1111-4111-8111-111111111111"
USER_ID = "22222222-2222-4222-8222-222222222222"

lost_publication_requests: list[dict] = []


@app.get("/api/v1/assistant/context")
async def context(request: Request) -> dict[str, str]:
    identity = request.headers.get("x-demo-user-id")
    if not identity:
        raise HTTPException(status_code=401, detail="missing identity")
    if identity == ADMIN_ID:
        return {"role": "ADMIN"}
    if identity == USER_ID:
        return {"role": "USER"}
    raise HTTPException(status_code=401, detail="invalid identity")


@app.post("/api/v1/lost-publications", status_code=201)
async def create_lost_publication(request: Request) -> dict:
    identity = request.headers.get("x-demo-user-id")
    if identity != USER_ID:
        raise HTTPException(status_code=401, detail="invalid identity")

    body = await request.json()
    lost_publication_requests.append(
        {
            "identity": identity,
            "body": body,
        }
    )
    return {
        "id": "stub-lost-1",
        "type": "LOST",
        "status": "ACTIVE",
        "title": body.get("title"),
        "description": body.get("description"),
        "category": body.get("category"),
        "location": body.get("location"),
        "eventDate": body.get("eventDate"),
        "ownerId": "stub-owner",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
    }


@app.get("/api/v1/test/counts")
async def test_counts() -> dict:
    return {
        "lost_publications": len(lost_publication_requests),
        "requests": lost_publication_requests,
    }
