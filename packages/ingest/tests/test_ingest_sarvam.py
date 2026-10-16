"""Sarvam speech-to-text client: WAV chunking and the response -> recorder export conversion (no network)."""

import io
import wave

import httpx
import pytest
from ingest import sarvam


def _wav(seconds: float, rate: int = 16000) -> bytes:
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(rate)
        w.writeframes(b"\x00\x00" * int(seconds * rate))
    return out.getvalue()


def test_split_wav_cuts_long_recordings_into_29s_chunks():
    chunks = sarvam.split_wav(_wav(70.0))
    assert [round(o, 1) for o, _ in chunks] == [0.0, 29.0, 58.0]
    for _, data in chunks:
        with wave.open(io.BytesIO(data), "rb") as w:
            assert w.getframerate() == 16000 and w.getnframes() <= 29 * 16000
    assert sarvam.split_wav(_wav(5.0)) and len(sarvam.split_wav(_wav(5.0))) == 1
    assert sarvam.split_wav(b"not a wav") == [(0.0, b"not a wav")]


def _fake_client(responses: list[dict]):
    calls: list[dict] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append({"url": str(request.url), "key": request.headers.get("api-subscription-key"), "body": request.content[:4000]})
        return httpx.Response(200, json=responses[len(calls) - 1])

    return httpx.Client(transport=httpx.MockTransport(handler)), calls


def test_transcribe_to_export_shifts_diarised_entries_onto_the_meeting_timeline():
    first = {
        "request_id": "r1",
        "language_code": "hi-IN",
        "transcript": "...",
        "diarized_transcript": {"entries": [
            {"speaker_id": "SPEAKER_00", "start_time_seconds": 0.5, "end_time_seconds": 4.0, "transcript": "UPI flow Thursday tak ho jayega"},
            {"speaker_id": "SPEAKER_01", "start_time_seconds": 4.2, "end_time_seconds": 7.0, "transcript": "Theek hai, Thursday."},
        ]},
    }
    second = {"request_id": "r2", "language_code": "hi-IN", "transcript": "move it to Friday", "timestamps": {"chunks": ["move it to Friday"], "start_time_seconds": [1.0], "end_time_seconds": [3.0]}}
    client, calls = _fake_client([first, second])
    export = sarvam.transcribe_to_export(
        _wav(35.0), "standup.wav", meeting_id="mtg_x", title="Hinglish standup", audio_uri="data/meetings/x.wav", api_key="k", started_at="2026-10-17T11:00:00+05:30", client=client
    )
    assert len(calls) == 2 and all(c["key"] == "k" and c["url"] == sarvam.SARVAM_STT_URL for c in calls)
    assert b'name="model"' in calls[0]["body"] and b"saaras:v3" in calls[0]["body"] and b'name="with_diarization"' in calls[0]["body"]
    segs = export["segments"]
    assert [(s["start_ms"], s["end_ms"], s["speaker_id"]) for s in segs] == [(500, 4000, "spk_speaker_00"), (4200, 7000, "spk_speaker_01"), (30000, 32000, "spk_speaker")]
    assert export["meeting"]["ended_at"] == "2026-10-17T11:00:32+05:30" and export["meeting"]["audio_uri"] == "data/meetings/x.wav"
    assert [s["id"] for s in export["speakers"]] == ["spk_speaker_00", "spk_speaker_01", "spk_speaker"]
    assert export["transcription"] == {"provider": "sarvam", "model": "saaras:v3", "mode": "codemix", "language_code": "hi-IN", "request_ids": ["r1", "r2"], "chunks": 2}


def test_transcribe_bytes_raises_on_service_errors():
    client, _ = _fake_client([])

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(422, json={"error": {"message": "audio too long"}})

    client = httpx.Client(transport=httpx.MockTransport(handler))
    with pytest.raises(sarvam.SarvamError, match="422"):
        sarvam.transcribe_bytes(b"x", "a.wav", api_key="k", client=client)
