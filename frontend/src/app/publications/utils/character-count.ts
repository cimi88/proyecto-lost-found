import { toSignal } from '@angular/core/rxjs-interop';
import type { Signal } from '@angular/core';
import type { FormControl } from '@angular/forms';
import { map, startWith } from 'rxjs';

export function characterCount(
  control: FormControl<string>,
): Signal<number> {
  const initialValue = control.value?.length ?? 0;

  return toSignal(
    control.valueChanges.pipe(
      startWith(control.value),
      map((value) => value?.length ?? 0),
    ),
    { initialValue },
  );
}
