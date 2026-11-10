import { Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-register-page',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-page.component.html',
  styleUrl: '../auth-pages.scss',
})
export class RegisterPageComponent {
  private readonly formBuilder = inject(FormBuilder);

  readonly submitted = signal(false);
  readonly form = this.formBuilder.nonNullable.group({
    displayName: ['', [Validators.required, Validators.minLength(2)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  submit(): void {
    this.submitted.set(false);

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    // Simulated registration: no request, no storage, no account creation.
    this.form.reset();
    this.submitted.set(true);
  }
}
