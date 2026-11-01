import { useEffect, useState } from 'react';
import { Alert, Button, Switch, TextField } from '@mui/material';
import {
  clearMemory,
  forgetMemory,
  loadMemory,
  memoryChangeEvent,
  saveMemory,
  setMemoryEnabled,
} from './memory';

export function MemorySettings({ busy }: { busy: boolean }) {
  const [state, setState] = useState(loadMemory);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    const refresh = () => setState(loadMemory());
    window.addEventListener(memoryChangeEvent, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(memoryChangeEvent, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  function change(action: () => void) {
    try {
      action();
      setState(loadMemory());
      setError('');
      setEditing(null);
      setConfirmClear(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Memory could not be changed.');
    }
  }
  return (
    <section aria-label="Saved memory" className="memory-settings">
      <div className="settings-row">
        <div>
          <strong>Use saved memory</strong>
          <p>Facts you explicitly ask to remember, available across chats in this browser.</p>
        </div>
        <Switch
          checked={state.enabled}
          disabled={busy}
          onChange={(_, enabled) => change(() => setMemoryEnabled(enabled))}
          slotProps={{ input: { 'aria-label': 'Use saved memory' } }}
        />
      </div>
      <p>
        Try “Remember that I prefer temperatures in Celsius”. Saving the same memory name updates
        it. Turning memory off keeps saved facts but stops using or adding them. Memory is separate
        from chat history.
      </p>
      {error && <Alert severity="error">{error}</Alert>}
      {state.entries.length ? (
        <ul className="memory-list">
          {state.entries.map((item) => (
            <li key={item.key}>
              <strong>{item.key}</strong>
              {editing === item.key ? (
                <>
                  <TextField
                    label={`Fact for ${item.key}`}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    fullWidth
                    multiline
                    size="small"
                    slotProps={{ htmlInput: { maxLength: 300 } }}
                  />
                  <Button
                    disabled={busy || !state.enabled || !value.trim()}
                    onClick={() =>
                      change(() => {
                        saveMemory(item.key, value);
                      })
                    }
                  >
                    Save fact
                  </Button>
                  <Button onClick={() => setEditing(null)}>Cancel</Button>
                </>
              ) : (
                <>
                  <p>{item.value}</p>
                  <Button
                    disabled={busy || !state.enabled}
                    onClick={() => {
                      setEditing(item.key);
                      setValue(item.value);
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    color="error"
                    disabled={busy}
                    onClick={() =>
                      change(() => {
                        forgetMemory(item.key);
                      })
                    }
                    aria-label={`Forget ${item.key}`}
                  >
                    Forget
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p>No saved memories yet.</p>
      )}
      {!!state.entries.length &&
        (confirmClear ? (
          <div role="group" aria-label="Confirm clearing saved memory">
            <p>Forget all saved facts? Past messages and tool results stay in your chats.</p>
            <Button color="error" disabled={busy} onClick={() => change(clearMemory)}>
              Forget all saved facts
            </Button>
            <Button onClick={() => setConfirmClear(false)}>Keep memories</Button>
          </div>
        ) : (
          <Button color="error" disabled={busy} onClick={() => setConfirmClear(true)}>
            Clear saved memory
          </Button>
        ))}
      <p>
        Deleting a memory stops its use in future chats. It does not erase facts already present in
        past messages or tool results. Saved memory is not sent to public lookup providers.
      </p>
    </section>
  );
}
