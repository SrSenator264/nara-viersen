'use strict';
// system-update.js — "حدّث النظام" (للمالك): النسخة الحالية، هل في جديد على GitHub، وإطلاق مهمة Flamo-Update.
// الـ git pull وإعادة تشغيل السيرفر بيصيروا بسكربت Flamo-Update.ps1 (مهمة مجدولة)، مو من داخل السيرفر.
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { execFile, spawn } = require('node:child_process');

const REPO = 'SrSenator264/nara-viersen';
const TASK = 'Flamo-Update';
let remoteCache = { at: 0, val: null };

function currentSha(root) {
  try {
    const git = path.join(root, '.git');
    const head = fs.readFileSync(path.join(git, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return /^[0-9a-f]{40}$/.test(head) ? head : null;
    const ref = head.slice(4).trim();
    try { const s = fs.readFileSync(path.join(git, ref), 'utf8').trim(); if (/^[0-9a-f]{40}$/.test(s)) return s; } catch { /* packed */ }
    for (const line of fs.readFileSync(path.join(git, 'packed-refs'), 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([0-9a-f]{40}) (.+)$/); if (m && m[2] === ref) return m[1];
    }
  } catch { /* kein .git */ }
  return null;
}

function latestRemote() {
  if (Date.now() - remoteCache.at < 60000) return Promise.resolve(remoteCache.val);
  return new Promise(resolve => {
    const req = https.get({ host: 'api.github.com', path: `/repos/${REPO}/commits/main`, headers: { 'User-Agent': 'flamo-update', Accept: 'application/vnd.github+json' }, timeout: 6000 }, res => {
      let b = ''; res.on('data', c => { b += c; if (b.length > 200000) req.destroy(); });
      res.on('end', () => {
        try { const j = JSON.parse(b); const v = j && j.sha ? { sha: j.sha, message: String((j.commit && j.commit.message) || '').split('\n')[0].slice(0, 160), date: j.commit && j.commit.committer && j.commit.committer.date } : null; remoteCache = { at: Date.now(), val: v }; resolve(v); }
        catch { resolve(null); }
      });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
  });
}

function readLast(root) {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'logs', 'update-status.json'), 'utf8').replace(/^﻿/, '')); } catch { return null; }
}
const isRunning = last => !!last && last.state === 'RUNNING' && Date.now() - Date.parse(last.time || 0) < 5 * 60000;

async function status(root) {
  const cur = currentSha(root), remote = await latestRemote(), last = readLast(root);
  return { current: cur, remote, behind: !!(cur && remote && remote.sha !== cur), running: isRunning(last), last };
}

function start(root) {
  const last = readLast(root);
  if (isRunning(last)) return Promise.reject(new Error('التحديث شغّال هلأ، استنى دقيقة.'));
  return new Promise((resolve, reject) => {
    execFile('schtasks', ['/Run', '/TN', TASK], { windowsHide: true, timeout: 15000 }, err => {
      if (!err) return resolve({ started: true, via: 'task' });
      // احتياط: شغّل السكربت مباشرة (بنفس مستخدم السيرفر)
      try {
        const ps1 = path.join(root, 'Flamo-Update.ps1');
        if (!fs.existsSync(ps1)) return reject(new Error('مهمة Flamo-Update مو موجودة. شغّل Flamo-Update-Einrichten.cmd مرة وحدة على كمبيوتر المحل.'));
        const p = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ps1], { cwd: root, detached: true, stdio: 'ignore', windowsHide: true });
        p.on('error', () => {}); p.unref();
        resolve({ started: true, via: 'direct' });
      } catch (e) { reject(new Error('ما قدرت أبدأ التحديث: ' + e.message)); }
    });
  });
}

module.exports = { status, start, currentSha };
