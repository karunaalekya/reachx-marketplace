package com.marketplace.common.security;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

// Same JWT-subject extraction mechanism as @CurrentVendor, but named correctly for admin-only
// endpoints so the code reads honestly - an admin id being called "vendorId" was a naming bug.
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentAdmin {}
