import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderUi } from '../test/render';
import { AudioPreview } from './AudioPreview';
import { checkFile, FileDrop, type FileRule } from './FileDrop';
import { coverProblem, ImagePicker, squareCrop } from './ImagePicker';

const audio: FileRule = { accept: ['audio/mpeg', 'audio/*', '.m4a'], maxBytes: 1000 };
const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type });

describe('checkFile', () => {
  it('accepts by exact type, wildcard type and extension', () => {
    expect(checkFile(file('a.mp3', 'audio/mpeg'), { accept: ['audio/mpeg'], maxBytes: 1000 })).toBeNull();
    expect(checkFile(file('a.wav', 'audio/wav'), { accept: ['audio/*'], maxBytes: 1000 })).toBeNull();
    expect(checkFile(file('A.M4A', ''), { accept: ['.m4a'], maxBytes: 1000 })).toBeNull();
  });

  it('rejects a wrong type and a file over the limit, with a message that names the file', () => {
    expect(checkFile(file('notes.pdf', 'application/pdf'), audio)).toBe('notes.pdf: this file type is not supported.');
    expect(checkFile(file('big.mp3', 'audio/mpeg', 5000), audio)).toBe('big.mp3 is 4.9 KB. The limit is 1000 B.');
  });
});

describe('FileDrop', () => {
  it('passes a picked file on and lets the same file be picked again', async () => {
    const onFiles = vi.fn();
    renderUi(<FileDrop label="Audio file" hint="MP3 up to 500 MB" rule={audio} onFiles={onFiles} />);
    expect(screen.getByText('MP3 up to 500 MB')).toBeInTheDocument();
    const input = screen.getByLabelText('Audio file') as HTMLInputElement;
    const f = file('calm.mp3', 'audio/mpeg');
    await userEvent.upload(input, f);
    await userEvent.upload(input, f);
    expect(onFiles).toHaveBeenCalledTimes(2);
    expect(onFiles.mock.calls[0]?.[0]).toEqual([f]);
  });

  it('rejects a wrong file before upload and says why', () => {
    const onFiles = vi.fn();
    const onReject = vi.fn();
    renderUi(<FileDrop label="Audio file" rule={audio} onFiles={onFiles} onReject={onReject} />);
    // fireEvent bypasses the input's `accept` filter, like a drag-and-drop does
    fireEvent.change(screen.getByLabelText('Audio file'), { target: { files: [file('notes.pdf', 'application/pdf')] } });
    expect(onFiles).not.toHaveBeenCalled();
    expect(onReject).toHaveBeenCalledWith(['notes.pdf: this file type is not supported.']);
    expect(screen.getByRole('alert')).toHaveTextContent('notes.pdf: this file type is not supported.');
  });

  it('drop: takes one file by default, several with `multiple`, and filters the bad ones', () => {
    const onFiles = vi.fn();
    const good1 = file('a.mp3', 'audio/mpeg');
    const good2 = file('b.mp3', 'audio/mpeg');
    const bad = file('c.pdf', 'application/pdf');
    const { rerender } = renderUi(<FileDrop label="Audio file" rule={audio} onFiles={onFiles} />);
    const zone = () => screen.getByText('Audio file', { selector: 'span.truncate' }).closest('div')!.parentElement!;
    fireEvent.drop(zone(), { dataTransfer: { files: [good1, good2] } });
    expect(onFiles).toHaveBeenLastCalledWith([good1]);
    rerender(<FileDrop label="Audio file" rule={audio} onFiles={onFiles} multiple />);
    fireEvent.drop(zone(), { dataTransfer: { files: [good1, bad, good2] } });
    expect(onFiles).toHaveBeenLastCalledWith([good1, good2]);
    expect(screen.getByRole('alert')).toHaveTextContent('c.pdf');
  });

  it('shows progress with cancel while uploading, and hides the file button', async () => {
    const onCancel = vi.fn();
    renderUi(
      <FileDrop
        label="Audio file"
        rule={audio}
        onFiles={() => {}}
        onCancel={onCancel}
        state={{ status: 'uploading', fileName: 'calm.wav', progress: 0.42 }}
      />,
    );
    expect(screen.getByRole('progressbar', { name: 'Uploading calm.wav' })).toHaveAttribute('aria-valuenow', '42');
    expect(screen.queryByRole('button', { name: 'Choose file' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel upload' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows the error with retry, and "Replace" once a file is there', async () => {
    const onRetry = vi.fn();
    const { rerender } = renderUi(
      <FileDrop
        label="Audio file"
        rule={audio}
        onFiles={() => {}}
        onRetry={onRetry}
        state={{ status: 'error', fileName: 'calm.wav', message: 'Upload failed.' }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed.');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalled();
    rerender(
      <FileDrop
        label="Audio file"
        rule={audio}
        onFiles={() => {}}
        state={{ status: 'done', fileName: 'calm.wav', meta: '15:00 · 14 MB' }}
      />,
    );
    expect(screen.getByText('15:00 · 14 MB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
  });

  it('does nothing while disabled', () => {
    const onFiles = vi.fn();
    renderUi(<FileDrop label="Audio file" rule={audio} onFiles={onFiles} disabled />);
    expect(screen.getByRole('button', { name: 'Choose file' })).toBeDisabled();
    fireEvent.drop(screen.getByRole('button', { name: 'Choose file' }).parentElement!, {
      dataTransfer: { files: [file('a.mp3', 'audio/mpeg')] },
    });
    expect(onFiles).not.toHaveBeenCalled();
  });
});

describe('AudioPreview', () => {
  class FakeAudio extends EventTarget {
    static made: FakeAudio[] = [];
    paused = true;
    preload = '';
    constructor(public src: string) {
      super();
      FakeAudio.made.push(this);
    }
    play() {
      this.paused = false;
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    }
    pause() {
      if (this.paused) return;
      this.paused = true;
      this.dispatchEvent(new Event('pause'));
    }
  }

  beforeEach(() => {
    FakeAudio.made = [];
    vi.stubGlobal('Audio', FakeAudio);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('creates no audio element until the first play, then toggles play and pause', async () => {
    renderUi(<AudioPreview name="Kyoto bowl" src="https://cdn.test/bowl.m4a" />);
    expect(FakeAudio.made).toHaveLength(0);
    await userEvent.click(screen.getByRole('button', { name: 'Play sample: Kyoto bowl' }));
    expect(FakeAudio.made).toHaveLength(1);
    expect(FakeAudio.made[0]?.preload).toBe('none');
    const pause = screen.getByRole('button', { name: 'Pause sample: Kyoto bowl' });
    expect(pause).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(pause);
    expect(screen.getByRole('button', { name: 'Play sample: Kyoto bowl' })).toHaveAttribute('aria-pressed', 'false');
    expect(FakeAudio.made).toHaveLength(1);
  });

  it('only one sample plays at a time', async () => {
    renderUi(
      <>
        <AudioPreview name="Bowl" src="https://cdn.test/a.m4a" />
        <AudioPreview name="Bell" src="https://cdn.test/b.m4a" />
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Play sample: Bowl' }));
    await userEvent.click(screen.getByRole('button', { name: 'Play sample: Bell' }));
    expect(FakeAudio.made.map((a) => a.paused)).toEqual([true, false]);
    expect(screen.getByRole('button', { name: 'Play sample: Bowl' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause sample: Bell' })).toBeInTheDocument();
  });

  it('stops when it leaves the page', async () => {
    const { unmount } = renderUi(<AudioPreview name="Bowl" src="https://cdn.test/a.m4a" />);
    await userEvent.click(screen.getByRole('button', { name: 'Play sample: Bowl' }));
    unmount();
    expect(FakeAudio.made[0]?.paused).toBe(true);
  });

  it('is disabled without a file, and says so when a file cannot be played', async () => {
    const { rerender } = renderUi(<AudioPreview name="Bowl" src={null} />);
    expect(screen.getByRole('button', { name: 'Play sample: Bowl' })).toBeDisabled();
    rerender(<AudioPreview name="Bowl" src="https://cdn.test/broken.m4a" />);
    await userEvent.click(screen.getByRole('button', { name: 'Play sample: Bowl' }));
    FakeAudio.made[0]?.pause();
    fireEvent(FakeAudio.made[0] as unknown as Element, new Event('error'));
    expect(await screen.findByRole('button', { name: 'Cannot play Bowl' })).toBeInTheDocument();
  });
});

describe('ImagePicker', () => {
  it('squareCrop takes the largest centred square', () => {
    expect(squareCrop(3000, 2000)).toEqual({ sx: 500, sy: 0, size: 2000 });
    expect(squareCrop(1200, 1800)).toEqual({ sx: 0, sy: 300, size: 1200 });
    expect(squareCrop(1500, 1500)).toEqual({ sx: 0, sy: 0, size: 1500 });
  });

  it('coverProblem enforces the minimum size on the shorter side', () => {
    expect(coverProblem(3000, 1200, 1200)).toBeNull();
    expect(coverProblem(3000, 1199, 1200)).toBe('The image is 3000 × 1199 px. It needs at least 1200 px on its shorter side.');
  });

  it('rejects a file that is not an image, without calling onChange', async () => {
    const onChange = vi.fn();
    renderUi(<ImagePicker label="Session cover" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Session cover'), { target: { files: [file('notes.pdf', 'application/pdf')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('notes.pdf: this file type is not supported.');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('crops a good image to a square JPEG and hands it over', async () => {
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 3000, height: 2000, close }));
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['jpeg'], { type: 'image/jpeg' })));
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
    const onChange = vi.fn();
    renderUi(<ImagePicker label="Session cover" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Session cover'), { target: { files: [file('Ocean.png', 'image/png')] } });
    expect(await screen.findByRole('button', { name: 'Session cover: replace image' })).toBeInTheDocument();
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 500, 0, 2000, 2000, 0, 0, 2000, 2000);
    const out = onChange.mock.calls[0]?.[0] as File;
    expect(out.name).toBe('Ocean.jpg');
    expect(out.type).toBe('image/jpeg');
    expect(close).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('rejects an image that is too small, with the sizes in the message', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 800, height: 600, close: () => {} }));
    const onChange = vi.fn();
    renderUi(<ImagePicker label="Session cover" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Session cover'), { target: { files: [file('small.jpg', 'image/jpeg')] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('The image is 800 × 600 px. It needs at least 1200 px on its shorter side.');
    expect(onChange).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
