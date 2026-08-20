package com.marketplace.shipping;

import com.marketplace.order.model.Order;
import com.marketplace.order.repository.OrderRepository;
import com.marketplace.shipping.client.ShiprocketClient;
import com.marketplace.shipping.model.Shipment;
import com.marketplace.shipping.repository.ShipmentRepository;
import com.marketplace.shipping.service.ShippingService;
import com.marketplace.vendor.repository.VendorRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ShippingServiceTest {

    @Mock private ShipmentRepository shipmentRepository;
    @Mock private OrderRepository orderRepository;
    @Mock private VendorRepository vendorRepository;
    @Mock private ShiprocketClient shiprocketClient;
    @Mock private KafkaTemplate<String, Object> kafkaTemplate;

    private ShippingService shippingService() {
        // Field order must match ShippingService's actual constructor (Lombok
        // @RequiredArgsConstructor, generated from declared field order) - this broke silently
        // once before when VendorRepository was added to the service but not here. Kept the
        // fields declared above in the same order as the service to make future drift obvious.
        ShippingService service = new ShippingService(
                shipmentRepository, orderRepository, vendorRepository, shiprocketClient, kafkaTemplate);
        ReflectionTestUtils.setField(service, "defaultPickupLocation", "Primary");
        return service;
    }

    @Test
    void createShipments_rejectsOrderThatIsNotPaid() {
        Order order = Order.builder().id(1L).status(Order.OrderStatus.PENDING_PAYMENT).build();
        when(orderRepository.findById(1L)).thenReturn(Optional.of(order));

        assertThrows(IllegalStateException.class,
                () -> shippingService().createShipmentsForPaidOrder(1L));

        verify(shipmentRepository, never()).save(any());
    }

    @Test
    void updateShipmentStatus_skipsUnrecognizedStatus_doesNotOverwriteShipment() {
        Shipment shipment = Shipment.builder()
                .id(1L).orderId(1L).vendorId(1L)
                .status(Shipment.ShipmentStatus.DELIVERED)
                .awbNumber("AWB123")
                .build();

        when(shipmentRepository.findByAwbNumber("AWB123")).thenReturn(Optional.of(shipment));

        shippingService().updateShipmentStatus("AWB123", "SOME_UNKNOWN_STATUS_XYZ");

        // Unrecognized status must never be saved - proves DELIVERED can't regress silently.
        verify(shipmentRepository, never()).save(any());
        verify(kafkaTemplate, never()).send(anyString(), any(), any());
    }
}
