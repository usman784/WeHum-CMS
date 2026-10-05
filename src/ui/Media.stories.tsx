import { AudioLines } from 'lucide-react';
import { useState } from 'react';
import { AudioPreview } from './AudioPreview';
import { FileDrop, type UploadState } from './FileDrop';
import { ImagePicker } from './ImagePicker';

export default { title: 'ui/Media' };

const audio = { accept: ['audio/mpeg', 'audio/wav', 'audio/mp4', '.m4a'], maxBytes: 500 * 1024 * 1024 };
const noop = () => {};

export const FileDropStates = () => {
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  return (
    <div className="flex max-w-2xl flex-col gap-3">
      <FileDrop
        label="Audio file"
        hint="MP3, WAV or M4A · up to 500 MB"
        rule={audio}
        state={state}
        onFiles={([f]) => f && setState({ status: 'done', fileName: f.name, meta: 'Picked (demo: nothing is uploaded)' })}
        icon={<AudioLines size={22} aria-hidden />}
      />
      <FileDrop
        label="Audio file"
        rule={audio}
        onFiles={noop}
        onCancel={noop}
        state={{ status: 'uploading', fileName: 'steady_under_pressure_final.wav', progress: 0.42 }}
      />
      <FileDrop
        label="Audio file"
        rule={audio}
        onFiles={noop}
        state={{ status: 'processing', fileName: 'steady_under_pressure_final.wav', progress: 0.8 }}
      />
      <FileDrop
        label="Audio file"
        rule={audio}
        onFiles={noop}
        state={{ status: 'done', fileName: 'steady_under_pressure_final.wav', meta: '15:00 · converted to AAC for the app · 14 MB' }}
      />
      <FileDrop
        label="Audio file"
        rule={audio}
        onFiles={noop}
        onRetry={noop}
        state={{ status: 'error', fileName: 'broken.wav', message: 'Upload failed. Check your connection and retry.' }}
      />
    </div>
  );
};

export const AudioSamples = () => (
  <div className="flex items-center gap-3">
    <AudioPreview name="Kyoto bowl" src="https://cdn.example.com/samples/kyoto-bowl.m4a" />
    <AudioPreview name="Not uploaded yet" src={null} />
  </div>
);

export const CoverImage = () => (
  <div className="grid max-w-xl grid-cols-2 gap-4">
    <ImagePicker label="Session cover" onChange={noop} />
    <ImagePicker label="Session cover" note="Uses the YouTube thumbnail (you can replace it)" onChange={noop} disabled />
  </div>
);
