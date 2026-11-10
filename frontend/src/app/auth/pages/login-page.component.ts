import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AssistantConversationStore } from '../../assistant/services/assistant-conversation.store';
import {
  DemoSessionService,
  type DemoProfile,
} from '../../core/demo-session.service';
import { IdentityService } from '../../core/identity.service';

@Component({
  selector: 'app-login-page',
  imports: [RouterLink],
  templateUrl: './login-page.component.html',
  styleUrl: '../auth-pages.scss',
})
export class LoginPageComponent {
  private readonly session = inject(DemoSessionService);
  private readonly identity = inject(IdentityService);
  private readonly assistant = inject(AssistantConversationStore);
  private readonly router = inject(Router);

  readonly profiles = this.session.profiles;
  readonly demoEnabled = environment.demoIdentity.enabled;
  readonly selectingId = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  selectProfile(profile: DemoProfile): void {
    if (this.selectingId() || !this.demoEnabled) {
      return;
    }

    this.errorMessage.set(null);
    const selected = this.session.select(profile.id);

    if (!selected) {
      this.errorMessage.set(
        'No se pudo activar el perfil demo seleccionado.',
      );
      return;
    }

    this.selectingId.set(profile.id);
    this.identity.reset();
    this.assistant.resetForIdentityChange();

    this.identity.load().subscribe({
      next: () => {
        this.selectingId.set(null);
        void this.router.navigateByUrl('/publications');
      },
      error: () => {
        this.selectingId.set(null);
        this.session.clear();
        this.identity.reset();
        this.assistant.resetForIdentityChange();
        this.errorMessage.set(
          'No se pudo iniciar el perfil demo. Verificá que el backend demo esté disponible.',
        );
      },
    });
  }
}
