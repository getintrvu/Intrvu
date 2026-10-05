import { PROVIDERS, byokHeaders, clearByok, engineId, getByok, maskKey, saveByok } from './byok';

const KEY = 'AIzaSyD-example-key-0123456789abcdef';

beforeEach(() => clearByok());

describe('stored settings', () => {
  it('round-trips and trims what is saved', async () => {
    await saveByok({ provider: 'gemini', apiKey: `  ${KEY}  `, model: '  gemini-x  ' });
    expect(await getByok()).toEqual({ provider: 'gemini', apiKey: KEY, model: 'gemini-x' });
  });

  it('drops an empty model so the provider default is used', async () => {
    await saveByok({ provider: 'openai', apiKey: KEY, model: '   ' });
    expect(await getByok()).toEqual({ provider: 'openai', apiKey: KEY });
  });

  it('is null when nothing (or something malformed) is stored, and after clearing', async () => {
    expect(await getByok()).toBeNull();
    localStorage.setItem('intrvufit_byok', JSON.stringify({ provider: 'anthropic', apiKey: KEY }));
    expect(await getByok()).toBeNull();
    localStorage.setItem('intrvufit_byok', JSON.stringify({ provider: 'gemini', apiKey: '' }));
    expect(await getByok()).toBeNull();
    await saveByok({ provider: 'gemini', apiKey: KEY });
    await clearByok();
    expect(await getByok()).toBeNull();
  });
});

describe('request headers', () => {
  it('sends provider, key and (when set) model', () => {
    expect(byokHeaders({ provider: 'openai', apiKey: KEY, model: 'gpt-4o' })).toEqual({
      'X-LLM-Provider': 'openai',
      'X-LLM-Key': KEY,
      'X-LLM-Model': 'gpt-4o',
    });
    expect(byokHeaders({ provider: 'gemini', apiKey: KEY })).toEqual({ 'X-LLM-Provider': 'gemini', 'X-LLM-Key': KEY });
  });

  it('sends nothing without a key', () => {
    expect(byokHeaders(null)).toEqual({});
    expect(byokHeaders(undefined)).toEqual({});
  });
});

it('masks keys so they can be recognised but not used', () => {
  expect(maskKey(KEY)).toBe('AIza…cdef');
  expect(maskKey(KEY)).not.toContain('example');
  expect(maskKey('short')).toBe('••••');
});

it('identifies the engine so saved results are not shared between providers or models', () => {
  expect(engineId(null)).toBe('server');
  expect(engineId({ provider: 'gemini', apiKey: KEY })).toBe('gemini:default');
  expect(engineId({ provider: 'gemini', apiKey: KEY, model: 'm1' })).not.toBe(engineId({ provider: 'gemini', apiKey: KEY, model: 'm2' }));
  expect(engineId({ provider: 'openai', apiKey: KEY })).not.toBe(engineId({ provider: 'gemini', apiKey: KEY }));
});

it('has a default model for every provider', () => {
  for (const provider of Object.values(PROVIDERS)) expect(provider.defaultModel).toBeTruthy();
});
