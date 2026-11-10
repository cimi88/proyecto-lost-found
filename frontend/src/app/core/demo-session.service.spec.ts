import { TestBed } from '@angular/core/testing';
import {
  DEMO_SESSION_STORAGE_KEY,
  DEMO_USER_A_ID,
  DEMO_USER_B_ID,
  DemoSessionService,
} from './demo-session.service';

describe('DemoSessionService', () => {
  let service: DemoSessionService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(DemoSessionService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('starts without an active identity', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.activeProfile()).toBeNull();
  });

  it('selects only the fixed demo profiles and persists the identity', () => {
    const profile = service.select(DEMO_USER_A_ID);

    expect(profile?.label).toBe('Usuario demo A');
    expect(service.activeProfile()?.id).toBe(DEMO_USER_A_ID);
    expect(localStorage.getItem(DEMO_SESSION_STORAGE_KEY)).toBe(
      DEMO_USER_A_ID,
    );
  });

  it('restores the selected profile after a new service instance', () => {
    service.select(DEMO_USER_B_ID);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    const restored = TestBed.inject(DemoSessionService);

    expect(restored.activeProfile()?.id).toBe(DEMO_USER_B_ID);
    expect(restored.activeProfile()?.description).toBe(
      'Usuario Solicitante',
    );
  });

  it('rejects arbitrary identities', () => {
    const profile = service.select(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(profile).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(DEMO_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('clears only the active demo identity', () => {
    localStorage.setItem('other-key', 'keep');
    service.select(DEMO_USER_A_ID);
    service.clear();

    expect(service.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(DEMO_SESSION_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem('other-key')).toBe('keep');
  });
});
