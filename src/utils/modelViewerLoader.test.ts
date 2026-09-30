import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MODEL_VIEWER_DRACO_PATH,
  MODEL_VIEWER_SCRIPT_URL,
  loadModelViewer,
  resetModelViewerLoader,
} from './modelViewerLoader';

interface GlobalWithModelViewer {
  ModelViewerElement?: { dracoDecoderLocation?: string };
}

function modelViewerGlobal(): GlobalWithModelViewer {
  return window as unknown as GlobalWithModelViewer;
}

function scripts(): HTMLScriptElement[] {
  return Array.from(document.head.querySelectorAll('script')) as HTMLScriptElement[];
}

function fireScriptError(): void {
  const all = scripts();
  all[all.length - 1]?.dispatchEvent(new Event('error'));
}

describe('modelViewerLoader', () => {
  beforeEach(() => {
    resetModelViewerLoader();
    scripts().forEach((s) => s.remove());
    delete modelViewerGlobal().ModelViewerElement;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    scripts().forEach((s) => s.remove());
    delete modelViewerGlobal().ModelViewerElement;
  });

  it('points model-viewer at the self-hosted Draco decoder before injecting the script', () => {
    const appendSpy = vi.spyOn(document.head, 'appendChild');
    void loadModelViewer();

    expect(modelViewerGlobal().ModelViewerElement?.dracoDecoderLocation).toBe(
      MODEL_VIEWER_DRACO_PATH,
    );
    const script = scripts()[scripts().length - 1];
    expect(script?.src).toBe(MODEL_VIEWER_SCRIPT_URL);
    expect(appendSpy).toHaveBeenCalledWith(script);
  });

  it('resolves false and warns when the CDN script fails to load', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const promise = loadModelViewer();
    fireScriptError();

    await expect(promise).resolves.toBe(false);
    expect(warn).toHaveBeenCalled();
  });

  it('clears the cached failure so a retry injects a fresh script', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const first = loadModelViewer();
    fireScriptError();
    await expect(first).resolves.toBe(false);
    expect(scripts()).toHaveLength(1);

    resetModelViewerLoader();
    expect(scripts()).toHaveLength(0);

    void loadModelViewer();
    expect(scripts()).toHaveLength(1);
  });
});
