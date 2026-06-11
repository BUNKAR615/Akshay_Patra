"use client";

import { useCallback, useState } from "react";
import { Field, TInput, Sel } from "./index";

/**
 * Labeled input/select with inline validate-on-blur.
 *
 * Props: label, name, value, onChange(e), type, required, disabled, rows,
 *        placeholder, hint, options ([{value,label}] → renders a select),
 *        validate (value) => errorString | null, validateOn ('blur'|'change'),
 *        error (external error overrides internal one), autoComplete, inputMode.
 */
export function FormField({
    label,
    name,
    value,
    onChange,
    type = "text",
    required,
    disabled,
    rows,
    placeholder,
    hint,
    options,
    validate,
    validateOn = "blur",
    error: externalError,
    autoComplete,
    inputMode,
}) {
    const [innerError, setInnerError] = useState(null);
    const error = externalError ?? innerError;

    const runValidation = useCallback(
        (v) => {
            let err = null;
            if (required && (v === "" || v == null)) err = "This field is required";
            else if (validate) err = validate(v) || null;
            setInnerError(err);
            return err;
        },
        [required, validate]
    );

    const handleChange = (e) => {
        onChange?.(e);
        if (validateOn === "change" || innerError) runValidation(e.target.value);
    };
    const handleBlur = (e) => {
        if (validateOn === "blur") runValidation(e.target.value);
    };

    return (
        <Field label={label} required={required} error={error} hint={!error ? hint : undefined}>
            {options ? (
                <Sel name={name} value={value} onChange={handleChange} disabled={disabled}>
                    {options.map((o) => (
                        <option key={o.value} value={o.value}>
                            {o.label}
                        </option>
                    ))}
                </Sel>
            ) : (
                <div onBlur={handleBlur}>
                    <TInput
                        name={name}
                        type={type}
                        value={value}
                        onChange={handleChange}
                        placeholder={placeholder}
                        disabled={disabled}
                        rows={rows}
                        autoComplete={autoComplete}
                        inputMode={inputMode}
                        invalid={!!error}
                    />
                </div>
            )}
        </Field>
    );
}

/**
 * Minimal form-state hook replacing the duplicated per-page useState pattern.
 *
 * const { values, errors, setValue, validateAll, reset } =
 *   useForm({ name: "" }, { name: (v) => (!v ? "Required" : null) });
 */
export function useForm(initialValues = {}, validators = {}) {
    const [values, setValues] = useState(initialValues);
    const [errors, setErrors] = useState({});

    const setValue = useCallback((name, value) => {
        setValues((prev) => ({ ...prev, [name]: value }));
        setErrors((prev) => (prev[name] ? { ...prev, [name]: null } : prev));
    }, []);

    const validateAll = useCallback(() => {
        const next = {};
        for (const [name, fn] of Object.entries(validators)) {
            const err = fn?.(values[name], values);
            if (err) next[name] = err;
        }
        setErrors(next);
        return Object.keys(next).length === 0;
    }, [validators, values]);

    const reset = useCallback((nextValues) => {
        setValues(nextValues ?? initialValues);
        setErrors({});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { values, errors, setValue, setValues, validateAll, reset };
}
