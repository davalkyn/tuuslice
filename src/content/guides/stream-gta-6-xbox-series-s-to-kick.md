---
title: "How to stream GTA 6 from an Xbox Series S to Kick"
description: "Kick isn't a built-in Xbox broadcast option, so here's the capture card and OBS setup, with NVENC settings, to stream GTA 6 from a Series S."
pubDate: 2026-10-12
featured: true
tags: ["streaming", "kick", "obs", "series s"]
platforms: ["xbox-series-s", "xbox-series-x"]
gear: ["capture-card", "rtx-5060-ti", "hdmi-cable", "usb-mic", "series-s-storage"]
---

As far as we know, **Kick isn't a built-in broadcast target on Xbox**, so you can't go live from the console the way you can with some other platforms. The fix is a classic setup: **console → capture card → PC running OBS → Kick**. The console runs the game, and the PC does all the streaming work.

## What you need

- An **Xbox Series S** (or Series X)
- An **HDMI capture card** with passthrough, so you can play on your TV with no lag while the PC records
- **Two HDMI cables**
- A **PC with a recent NVIDIA GPU**. We use an RTX 5060 Ti: its NVENC encoder handles the stream without touching your game, because the game runs on the console.
- **OBS Studio** (free)
- A **Kick account**, verified, with your stream key

## 1. Wire it up

1. Console **HDMI out** → capture card **HDMI in**.
2. Capture card **HDMI out** (passthrough) → your TV or monitor.
3. Capture card **USB** → your PC.

You play on the TV exactly as normal. The PC gets a copy of the picture and sound.

> Tip: set the Xbox to output **1080p** (Settings → General → TV & display options). Many capture cards only pass through 4K at 30 fps, and 1080p is what you'll stream anyway.

## 2. Add the console to OBS

1. In OBS, click **+** under Sources → **Video Capture Device** → pick your capture card.
2. Set the resolution to **1920×1080** and FPS to **60** (or match what your card supports).
3. If you don't hear game audio, add **Audio Input Capture** and pick the capture card's audio.
4. Add your **mic** as a separate Audio Input Capture so you can balance voice and game.

## 3. Connect OBS to Kick

1. On Kick, open your **Creator Dashboard → Settings → Stream URL & Key**.
2. In OBS, go to **Settings → Stream**. Choose **Kick** if it's listed, otherwise **Custom**, and paste the **Stream URL** as the server.
3. Paste your **Stream Key**. Never show it on stream: anyone with it can stream to your channel.

## 4. Encoder settings (NVENC)

In **Settings → Output**, switch Output Mode to **Advanced**, then:

| Setting | Value |
| --- | --- |
| Encoder | NVIDIA NVENC H.264 |
| Rate control | CBR |
| Bitrate | 6000 Kbps (drop to 4500 if your upload is weak) |
| Keyframe interval | 2 s |
| Preset | Quality |

In **Settings → Video**, set Output resolution to **1920×1080** (or 1280×720 for weaker connections) and **60 fps**.

As a rule of thumb, your upload speed should be at least **1.5× your bitrate**. Run a speed test before launch night.

## 5. Test before launch

- Do a **private test stream**, or record locally, and check that audio is in sync.
- Watch your **dropped frames** in OBS (View → Stats). If they climb, lower the bitrate.
- Turn on **spoiler rules** in chat before you go live on launch day.

## Why bother with the Series S?

Plenty of players will be on a Series S at launch and searching for how GTA 6 actually runs on it. Streaming it, warts and all, is content nobody else with a PS5 can make. Follow the [Series S tracker](/series-s/) for our launch-day numbers.
