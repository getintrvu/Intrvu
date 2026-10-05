import { clearResume, loadResume, saveResume } from './resumeStore';

it('round-trips a PDF through storage byte for byte', async () => {
  const bytes = new Uint8Array(100_000).map((_, i) => i % 251); // larger than one base64 chunk
  const original = new File([bytes], 'cv.pdf', { type: 'application/pdf', lastModified: 123 });

  await saveResume(original);
  const restored = await loadResume();

  expect(restored).not.toBeNull();
  expect(restored!.name).toBe('cv.pdf');
  expect(restored!.type).toBe('application/pdf');
  expect(new Uint8Array(await restored!.arrayBuffer())).toEqual(bytes);
});

it('returns null after clearing', async () => {
  await saveResume(new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' }));
  await clearResume();
  expect(await loadResume()).toBeNull();
});
