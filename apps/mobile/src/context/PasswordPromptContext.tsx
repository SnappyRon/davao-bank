import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { View } from 'react-native';
import { PasswordPromptOverlay } from '../components/PasswordPromptOverlay';
import { supabase } from '../lib/supabase';

export const PROMPT_UNAVAILABLE =
  'Could not show the confirmation prompt. Please try again.';
type Result = { success: boolean; cancelled?: boolean; error?: string };
type Request = { id: number; title: string; message: string };
type Pending = {
  id: number;
  resolve: (result: Result) => void;
  timer: ReturnType<typeof setTimeout>;
  verifying: boolean;
};
interface PromptContext {
  request: Request | null;
  activeHost: string;
  register: (id: string) => () => void;
  ask: (options: { title: string; message: string }) => Promise<Result>;
  acknowledge: (id: number) => void;
  confirm: (id: number, password: string) => Promise<boolean>;
  cancel: () => void;
}
const Context = createContext<PromptContext | null>(null);

export function PasswordPromptProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [hosts, setHosts] = useState<string[]>([]);
  const hostStack = useRef<string[]>([]);
  const pending = useRef<Pending | null>(null);
  const sequence = useRef(0);
  const finish = useCallback((result: Result) => {
    const current = pending.current;
    if (!current) return;
    pending.current = null;
    clearTimeout(current.timer);
    setRequest(null);
    current.resolve(result);
  }, []);
  const cancel = useCallback(() => {
    if (!pending.current?.verifying) finish({ success: false, cancelled: true });
  }, [finish]);
  const register = useCallback(
    (id: string) => {
      // Do not move an acknowledged prompt onto a newly opening native window.
      if (pending.current) finish({ success: false, cancelled: true });
      hostStack.current = [...hostStack.current, id];
      setHosts(hostStack.current);
      return () => {
        // A disappearing owner must not strand a request or move it to an unrelated screen.
        if (hostStack.current.at(-1) === id) finish({ success: false, cancelled: true });
        hostStack.current = hostStack.current.filter((host) => host !== id);
        setHosts(hostStack.current);
      };
    },
    [finish]
  );
  const ask = useCallback(
    (options: { title: string; message: string }): Promise<Result> => {
      if (pending.current)
        return Promise.resolve({ success: false, error: PROMPT_UNAVAILABLE });
      return new Promise((resolve) => {
        const id = ++sequence.current;
        const timer = setTimeout(
          () => finish({ success: false, error: PROMPT_UNAVAILABLE }),
          2000
        );
        pending.current = { id, resolve, timer, verifying: false };
        setRequest({ id, ...options });
      });
    },
    [finish]
  );
  const acknowledge = useCallback((id: number) => {
    if (pending.current?.id === id) clearTimeout(pending.current.timer);
  }, []);
  const confirm = useCallback(
    async (id: number, password: string) => {
      const current = pending.current;
      if (!current || current.id !== id || current.verifying) return false;
      current.verifying = true;
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.email) return false;
        const { error } = await supabase.auth.signInWithPassword({
          email: user.email,
          password,
        });
        if (error || pending.current !== current) return false;
        finish({ success: true });
        return true;
      } catch {
        return false;
      } finally {
        current.verifying = false;
      }
    },
    [finish]
  );
  useEffect(
    () => () => {
      const current = pending.current;
      pending.current = null;
      if (current) {
        clearTimeout(current.timer);
        current.resolve({ success: false, cancelled: true });
      }
    },
    []
  );
  return (
    <Context.Provider
      value={{
        request,
        activeHost: hosts.at(-1) || 'root',
        register,
        ask,
        acknowledge,
        confirm,
        cancel,
      }}
    >
      <View style={{ flex: 1 }}>
        {children}
        <PasswordPromptHost hostId="root" />
      </View>
    </Context.Provider>
  );
}

export function usePasswordPrompt() {
  const context = useContext(Context);
  if (!context) throw new Error('PasswordPromptProvider is required');
  return context.ask;
}

export function usePasswordPromptHost(visible: boolean) {
  const id = useId();
  const context = useContext(Context);
  const register = context?.register;
  useLayoutEffect(() => {
    if (visible && register) return register(id);
  }, [visible, register, id]);
  return {
    id,
    hasPrompt: Boolean(context?.request && context.activeHost === id),
    cancel: context?.cancel,
  };
}

export function PasswordPromptHost({
  hostId,
  ready = true,
}: {
  hostId: string;
  ready?: boolean;
}) {
  const context = useContext(Context);
  if (!ready || !context?.request || context.activeHost !== hostId) return null;
  const { request } = context;
  return (
    <PasswordPromptOverlay
      key={request.id}
      title={request.title}
      message={request.message}
      onVisible={() => context.acknowledge(request.id)}
      onConfirm={(password) => context.confirm(request.id, password)}
      onCancel={context.cancel}
    />
  );
}
