"""POST /tenants/{t}/meetings/transcribe: Sarvam speech-to-text (mocked) feeding the meeting import."""

from __future__ import annotations

import io
import time
import wave

from apps.api.main import create_app
from apps.api.routes import meetings as meetings_route
from fastapi.testclient import TestClient



def _wav(seconds: float = 2.0) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(16000)
        w.writeframes(b"\x00\x00" * int(seconds * 16000))
    return out.getvalue()


def test_transcribe_needs_a_key(client):
    response = client.post("/tenants/orbit/meetings/transcribe", files={"file": ("clip.wav", _wav(), "audio/wav")}, data={"title": "Standup"})
    assert response.status_code == 503 and response.json()["error"]["code"] == "sarvam_not_configured"


def test_transcribe_imports_the_meeting_and_keeps_the_audio(data_dir, ctx_factory, monkeypatch):
    ctx = ctx_factory(sarvam_api_key="k")
    seen: dict = {}

    def fake_transcribe(audio, filename, **kw):
        seen.update(kw, filename=filename, size=len(audio))
        started = kw["started_at"]
        return {
            "version": 1,
            "meeting": {"id": kw["meeting_id"], "title": kw["title"], "started_at": started, "ended_at": started, "audio_uri": kw["audio_uri"]},
            "speakers": [{"id": "spk_speaker_00", "name": "Speaker 1", "role": "participant"}, {"id": "spk_speaker_01", "name": "Speaker 2", "role": "participant"}],
            "segments": [
                {"start_ms": 0, "end_ms": 4000, "speaker_id": "spk_speaker_00", "text": "UPI flow Thursday the 24th tak ho jayega."},
                {"start_ms": 4200, "end_ms": 7000, "speaker_id": "spk_speaker_01", "text": "Theek hai, Thursday."},
            ],
            "transcription": {"provider": "sarvam", "model": kw["model"], "mode": "codemix", "language_code": "hi-IN", "request_ids": ["r1"], "chunks": 1},
        }

    monkeypatch.setattr(meetings_route, "transcribe_to_export", fake_transcribe)
    app = create_app(ctx, start_workers=False)
    with TestClient(app) as client:
        response = client.post(
            "/tenants/orbit/meetings/transcribe",
            files={"file": ("standup.wav", _wav(), "audio/wav")},
            data={"title": "Hinglish standup", "language_code": "hi-IN", "started_at": "2026-10-17T11:00:00+05:30"},
        )
        assert response.status_code == 202, response.text
        body = response.json()
        assert body["segments"] == 2 and body["transcription"]["language_code"] == "hi-IN" and body["meeting_id"].startswith("mtg_orbit_rec_")
        assert seen["language_code"] == "hi-IN" and seen["api_key"] == "k" and seen["model"] == "saaras:v3" and seen["size"] > 44
        for _ in range(50):
            job = client.get(f"/tenants/orbit/jobs/{body['job_id']}").json()
            if job["status"] in ("done", "failed", "completed"):
                break
            time.sleep(0.1)
        assert job["status"] != "failed", job
        meeting = client.get(f"/tenants/orbit/meetings/{body['meeting_id']}").json()
        assert meeting["title"] == "Hinglish standup" and meeting["episodes"] >= 1
        audio = client.get(f"/tenants/orbit/meetings/{body['meeting_id']}/audio")
        assert audio.status_code == 200 and audio.headers["content-type"].startswith("audio/wav")
        assert (data_dir / "meetings" / (body["audio_uri"].split("/")[-1])).is_file()
