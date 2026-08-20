package com.marketplace.common.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// Marks a controller parameter to be resolved from the authenticated JWT's subject (vendor id).
// Usage: public ResponseEntity<X> create(@CurrentVendor Long vendorId, ...)
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentVendor {}
