package com.marketplace.config;

import org.apache.kafka.common.TopicPartition;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.kafka.config.ConcurrentKafkaListenerContainerFactory;
import org.springframework.kafka.core.ConsumerFactory;
import org.springframework.kafka.core.KafkaOperations;
import org.springframework.kafka.listener.DeadLetterPublishingRecoverer;
import org.springframework.kafka.listener.DefaultErrorHandler;
import org.springframework.util.backoff.FixedBackOff;

@Configuration
public class KafkaErrorHandlingConfig {

    // Per-listener-group container factories, not one shared error handler. A single shared
    // DeadLetterPublishingRecoverer would route BOTH shipping-service's and commission-service's
    // failures on the same order.paid message to the identical "order.paid.DLT" topic - making
    // it impossible to tell which consumer group actually failed when reviewing the DLT later.
    // Each factory below appends its own group name to the DLT topic instead.

    @Bean
    public ConcurrentKafkaListenerContainerFactory<Object, Object> shippingKafkaListenerContainerFactory(
            ConsumerFactory<Object, Object> consumerFactory, KafkaOperations<Object, Object> kafkaOperations) {
        return buildFactory(consumerFactory, kafkaOperations, "shipping-service");
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<Object, Object> commissionKafkaListenerContainerFactory(
            ConsumerFactory<Object, Object> consumerFactory, KafkaOperations<Object, Object> kafkaOperations) {
        return buildFactory(consumerFactory, kafkaOperations, "commission-service");
    }

    @Bean
    public ConcurrentKafkaListenerContainerFactory<Object, Object> invoiceKafkaListenerContainerFactory(
            ConsumerFactory<Object, Object> consumerFactory, KafkaOperations<Object, Object> kafkaOperations) {
        return buildFactory(consumerFactory, kafkaOperations, "invoice-service");
    }

    // payout-service gets 3 retries same as everything else here, but note PayoutService itself
    // deliberately does NOT let gateway-call exceptions reach this handler (see its class
    // javadoc) - what DOES reach this handler/DLT is a genuinely missing commission record,
    // which is a real data-ordering problem worth retrying, not a payment-gateway failure.
    @Bean
    public ConcurrentKafkaListenerContainerFactory<Object, Object> payoutKafkaListenerContainerFactory(
            ConsumerFactory<Object, Object> consumerFactory, KafkaOperations<Object, Object> kafkaOperations) {
        return buildFactory(consumerFactory, kafkaOperations, "payout-service");
    }

    private ConcurrentKafkaListenerContainerFactory<Object, Object> buildFactory(
            ConsumerFactory<Object, Object> consumerFactory, KafkaOperations<Object, Object> kafkaOperations,
            String groupName) {

        var recoverer = new DeadLetterPublishingRecoverer(kafkaOperations,
                (record, ex) -> new TopicPartition(record.topic() + "." + groupName + ".DLT", record.partition()));

        // 3 retries, 1s apart, then to this group's own DLT topic - a failure never just
        // vanishes, and reviewing "order.paid.commission-service.DLT" tells you exactly which
        // service's processing failed, unlike a shared DLT topic would.
        var errorHandler = new DefaultErrorHandler(recoverer, new FixedBackOff(1000L, 3L));

        var factory = new ConcurrentKafkaListenerContainerFactory<Object, Object>();
        factory.setConsumerFactory(consumerFactory);
        factory.setCommonErrorHandler(errorHandler);
        return factory;
    }
}
