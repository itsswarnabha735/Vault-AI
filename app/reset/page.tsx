'use client';

import { useState } from 'react';

export default function ResetPage() {
  const [status, setStatus] = useState<string[]>([]);
  const [done, setDone] = useState(false);
  const [started, setStarted] = useState(false);

  async function runReset() {
    setStarted(true);
    setStatus([]);
    const log = (msg: string) => setStatus((prev) => [...prev, msg]);

    try {
      // 1. Delete from Supabase (cloud) FIRST
      log('🌐 Deleting transactions from Supabase...');
      const res = await fetch('/api/reset', { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) {
        log(
          `✅ Supabase: deleted ${data.deleted?.transactions ?? 0} transactions`
        );
      } else {
        log(`❌ Supabase error: ${data.error}`);
      }

      // 2. Delete IndexedDB
      log('💾 Deleting IndexedDB "VaultAI"...');
      await new Promise<void>((resolve) => {
        const req = indexedDB.deleteDatabase('VaultAI');
        req.onsuccess = () => {
          log('✅ IndexedDB deleted');
          resolve();
        };
        req.onerror = () => {
          log('⚠️ IndexedDB delete failed — try closing other Vault tabs');
          resolve();
        };
        req.onblocked = () => {
          log('⚠️ IndexedDB blocked — close ALL other Vault-AI tabs and retry');
          resolve();
        };
      });

      // 3. Clear OPFS
      log('📁 Clearing OPFS (uploaded documents)...');
      try {
        const root = await navigator.storage.getDirectory();
        const entries: string[] = [];
        for await (const name of (root as unknown as { keys(): AsyncIterable<string> }).keys()) {
          entries.push(name);
        }
        for (const name of entries) {
          await root.removeEntry(name, { recursive: true });
        }
        log(`✅ OPFS cleared (${entries.length} entries removed)`);
      } catch (e: unknown) {
        log(`⚠️ OPFS: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 4. Clear transformer/model caches
      log('🧠 Clearing model caches...');
      try {
        const names = await caches.keys();
        let cleared = 0;
        for (const n of names) {
          if (
            n.includes('transformers') ||
            n.includes('onnx') ||
            n.includes('model')
          ) {
            await caches.delete(n);
            cleared++;
          }
        }
        log(`✅ Cleared ${cleared} model cache(s)`);
      } catch (e: unknown) {
        log(`⚠️ Cache: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 5. Clear localStorage (keep auth)
      log('🔑 Clearing localStorage (keeping auth)...');
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          !key.includes('supabase') &&
          !key.includes('auth') &&
          !key.includes('sb-')
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
      log(`✅ Removed ${keysToRemove.length} localStorage items`);

      log('');
      log('🎉 All data cleared! You are still logged in.');
      log('Click the button below to start fresh.');
    } catch (e: unknown) {
      log(`❌ Error: ${e instanceof Error ? e.message : String(e)}`);
    }
    setDone(true);
  }

  return (
    <div style={{ padding: 40, fontFamily: 'monospace', maxWidth: 700 }}>
      <h1 style={{ marginBottom: 8 }}>🗑️ Vault-AI Full Data Reset</h1>
      <p style={{ color: '#aaa', marginBottom: 20 }}>
        This will delete ALL transactions from both local (IndexedDB) and cloud
        (Supabase). Your login session is preserved.
      </p>

      {!started && (
        <button
          onClick={runReset}
          style={{
            padding: '14px 28px',
            fontSize: 16,
            background: '#dc2626',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
        >
          ⚠️ Delete Everything &amp; Start Fresh
        </button>
      )}

      {status.length > 0 && (
        <div
          style={{
            background: '#111',
            color: '#0f0',
            padding: 20,
            borderRadius: 8,
            lineHeight: 1.8,
            marginTop: 20,
          }}
        >
          {status.map((s, i) => (
            <div key={i}>{s}</div>
          ))}
        </div>
      )}

      {done && (
        <button
          onClick={() => (window.location.href = '/vault')}
          style={{
            marginTop: 20,
            padding: '12px 24px',
            fontSize: 16,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
          }}
        >
          Go to Vault (Start Fresh) →
        </button>
      )}
    </div>
  );
}
