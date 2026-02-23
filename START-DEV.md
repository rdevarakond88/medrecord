# Starting the Dev Server — iPhone via Expo Go

Run this from the project root in WSL:

```
npm start
```

That is the only command. Nothing else.

---

## What happens

1. Any leftover process on port 8081 is killed automatically
2. Metro bundler starts on port 8081
3. An ngrok tunnel opens — this is what makes it work on WSL Windows,
   where the WSL network interface is not reachable from your iPhone

## Connecting your iPhone

After startup the terminal prints a URL like:

```
exp://xxxx-anonymous-8082.exp.direct
```

Open **Expo Go** on iPhone → tap **Enter URL manually** → paste that URL.

Your iPhone does not need to be on the same WiFi network as your laptop.
The tunnel works over the internet.

## If the URL changes between sessions

The ngrok subdomain (the `xxxx` part) changes every time you restart.
Re-enter the new URL in Expo Go. This is normal — ngrok free tier
generates a fresh subdomain each session.
