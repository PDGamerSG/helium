"""Speech to text through Sarvam AI (Saaras models) into the recorder export format.

Sarvam's synchronous endpoint takes one clip of at most 30 seconds, so longer WAV files are cut into
29-second chunks client side and the diarised entries are shifted back onto the meeting timeline.
Speaker labels are assigned per chunk by the service, so across chunk boundaries the same person may
get a different label; for a demo clip keep it under 30 seconds, or pass `num_speakers` and accept
per-chunk labels. Hindi, English and code-mixed speech ("Hinglish") are the point: `mode='codemix'`
keeps the transcript in the script and language it was spoken in.

Docs: https://docs.sarvam.ai/api-reference-docs/speech-to-text/apis/overview
"""

from __future__ import annotations

import io
import logging
import wave
from datetime import UTC, datetime
from typing import Any

import httpx

log = logging.getLogger("ingest.sarvam")

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"
CHUNK_SECONDS = 29.0
DEFAULT_MODEL = "saaras:v3"


class SarvamError(RuntimeError):
    """The service refused the request (bad key, unsupported audio, quota)."""


def split_wav(audio: bytes, chunk_seconds: float = CHUNK_SECONDS) -> list[tuple[float, bytes]]:
    """Cut a WAV file into `[(offset_seconds, wav_bytes)]` chunks of at most `chunk_seconds`.
    Anything that is not a WAV container is returned whole (the caller keeps it under 30 s)."""
    try:
        with wave.open(io.BytesIO(audio), "rb") as src:
            params = src.getparams()
            total = src.getnframes()
            frames_per_chunk = max(1, int(chunk_seconds * params.framerate))
            chunks: list[tuple[float, bytes]] = []
            offset_frames = 0
            while offset_frames < total:
                src.setpos(offset_frames)
                frames = src.readframes(min(frames_per_chunk, total - offset_frames))
                out = io.BytesIO()
                with wave.open(out, "wb") as dst:
                    dst.setnchannels(params.nchannels)
                    dst.setsampwidth(params.sampwidth)
                    dst.setframerate(params.framerate)
                    dst.writeframes(frames)
                chunks.append((offset_frames / params.framerate, out.getvalue()))
                offset_frames += frames_per_chunk
            return chunks or [(0.0, audio)]
    except (wave.Error, EOFError):
        return [(0.0, audio)]


def transcribe_bytes(
    audio: bytes,
    filename: str,
    *,
    api_key: str,
    model: str = DEFAULT_MODEL,
    language_code: str | None = None,
    mode: str = "codemix",
    diarize: bool = True,
    num_speakers: int | None = None,
    client: httpx.Client | None = None,
    timeout_s: float = 120.0,
) -> dict[str, Any]:
    """One synchronous call (clip of at most 30 s). Returns the raw response JSON
    (`transcript`, `language_code`, `timestamps`, `diarized_transcript.entries[...]`)."""
    data: dict[str, Any] = {"model": model, "mode": mode, "with_timestamps": "true", "with_diarization": "true" if diarize else "false"}
    if language_code:
        data["language_code"] = language_code
    if num_speakers:
        data["num_speakers"] = str(int(num_speakers))
    own = client is None
    client = client or httpx.Client(timeout=timeout_s)
    try:
        response = client.post(
            SARVAM_STT_URL,
            headers={"api-subscription-key": api_key},
            data=data,
            files={"file": (filename, audio, _mime_for(filename))},
        )
    finally:
        if own:
            client.close()
    if response.status_code >= 400:
        raise SarvamError(f"Sarvam speech-to-text returned {response.status_code}: {response.text[:300]}")
    return response.json()


def _mime_for(filename: str) -> str:
    name = filename.lower()
    for ext, mime in ((".wav", "audio/wav"), (".mp3", "audio/mpeg"), (".m4a", "audio/mp4"), (".aac", "audio/aac"), (".flac", "audio/flac"), (".ogg", "audio/ogg")):
        if name.endswith(ext):
            return mime
    return "application/octet-stream"


def _segments_from_response(resp: dict[str, Any], offset_s: float) -> list[dict[str, Any]]:
    """Diarised entries when present, else timestamped chunks, else the whole transcript as one segment."""
    entries = ((resp.get("diarized_transcript") or {}).get("entries")) or []
    out: list[dict[str, Any]] = []
    for e in entries:
        text = str(e.get("transcript") or "").strip()
        if not text:
            continue
        out.append(
            {
                "start_ms": round((offset_s + float(e.get("start_time_seconds") or 0.0)) * 1000),
                "end_ms": round((offset_s + float(e.get("end_time_seconds") or 0.0)) * 1000),
                "speaker_id": f"spk_{str(e.get('speaker_id') or 'speaker').lower().replace(' ', '_')}",
                "text": text,
            }
        )
    if out:
        return out
    stamps = resp.get("timestamps") or {}
    chunks = stamps.get("chunks") or []
    starts, ends = stamps.get("start_time_seconds") or [], stamps.get("end_time_seconds") or []
    for i, text in enumerate(chunks):
        text = str(text or "").strip()
        if not text:
            continue
        start = float(starts[i]) if i < len(starts) else 0.0
        end = float(ends[i]) if i < len(ends) else start
        out.append({"start_ms": round((offset_s + start) * 1000), "end_ms": round((offset_s + end) * 1000), "speaker_id": "spk_speaker", "text": text})
    if out:
        return out
    transcript = str(resp.get("transcript") or "").strip()
    if transcript:
        out.append({"start_ms": round(offset_s * 1000), "end_ms": round(offset_s * 1000), "speaker_id": "spk_speaker", "text": transcript})
    return out


def transcribe_to_export(
    audio: bytes,
    filename: str,
    *,
    meeting_id: str,
    title: str,
    audio_uri: str,
    api_key: str,
    started_at: str | None = None,
    model: str = DEFAULT_MODEL,
    language_code: str | None = None,
    mode: str = "codemix",
    num_speakers: int | None = None,
    client: httpx.Client | None = None,
) -> dict[str, Any]:
    """Transcribe a recording and shape it as a recorder export the ingestion pipeline accepts."""
    started = started_at or datetime.now(tz=UTC).replace(microsecond=0).isoformat()
    segments: list[dict[str, Any]] = []
    request_ids: list[str] = []
    detected: str | None = None
    for offset_s, chunk in split_wav(audio):
        resp = transcribe_bytes(
            chunk, filename, api_key=api_key, model=model, language_code=language_code, mode=mode, num_speakers=num_speakers, client=client
        )
        request_ids.append(str(resp.get("request_id") or ""))
        detected = detected or resp.get("language_code")
        segments.extend(_segments_from_response(resp, offset_s))
    segments.sort(key=lambda s: (s["start_ms"], s["end_ms"]))
    speaker_ids = list(dict.fromkeys(s["speaker_id"] for s in segments))
    speakers = [{"id": sid, "name": f"Speaker {i + 1}", "role": "participant"} for i, sid in enumerate(speaker_ids)]
    last_end = max((s["end_ms"] for s in segments), default=0)
    ended = _plus_ms(started, last_end)
    return {
        "version": 1,
        "meeting": {"id": meeting_id, "title": title, "started_at": started, "ended_at": ended, "audio_uri": audio_uri},
        "speakers": speakers,
        "segments": segments,
        "transcription": {"provider": "sarvam", "model": model, "mode": mode, "language_code": detected, "request_ids": request_ids, "chunks": len(request_ids)},
    }


def _plus_ms(iso: str, ms: int) -> str:
    try:
        dt = datetime.fromisoformat(iso)
    except ValueError:
        return iso
    from datetime import timedelta

    return (dt + timedelta(milliseconds=ms)).isoformat()
