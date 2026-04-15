package connfx

import (
	"context"
	"errors"
	"fmt"
	"maps"
	"math"
	"strconv"
	"sync/atomic"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

// Constants for AMQP adapter.
const (
	maxInt32 = math.MaxInt32
)

var (
	ErrAMQPClientNotInitialized = errors.New("AMQP client not initialized")
	ErrFailedToOpenConnection   = errors.New("failed to open AMQP connection")
	ErrFailedToOpenChannel      = errors.New("failed to open AMQP channel")
	ErrFailedToCloseConnection  = errors.New("failed to close AMQP connection")
	ErrFailedToCloseChannel     = errors.New("failed to close AMQP channel")
	ErrFailedToDeclareQueue     = errors.New("failed to declare queue")
	ErrFailedToPublishMessage   = errors.New("failed to publish message")
	ErrFailedToStartConsuming   = errors.New("failed to start consuming")
	ErrChannelClosed            = errors.New("channel closed")
	ErrFailedToReconnect        = errors.New("failed to reconnect")
	ErrDeliveryChannelClosed    = errors.New("delivery channel closed")
	ErrNoChannelAvailable       = errors.New("no channel available")
	ErrFailedToCloseAMQPClient  = errors.New("failed to close AMQP client")
	ErrAMQPOperation            = errors.New("AMQP operation failed")
	ErrAMQPConnectionFailed     = errors.New("failed to connect to AMQP")
	ErrFailedToCreateAMQPClient = errors.New("failed to create AMQP client")
	ErrAMQPUnsupportedOperation = errors.New("operation not supported by AMQP")
	ErrIntegerOverflow          = errors.New("integer overflow in conversion")
)

// AMQPConfig holds AMQP-specific configuration options.
type AMQPConfig struct {
	URL string
}

// NewDefaultAMQPConfig creates an AMQP configuration with sensible defaults.
func NewDefaultAMQPConfig() *AMQPConfig {
	return &AMQPConfig{ //nolint:gosec // G101: default RabbitMQ dev credentials
		URL: "amqp://guest:guest@localhost:5672/",
	}
}

// AMQPAdapter implements the QueueRepository interface for AMQP-based message queues.
type AMQPAdapter struct {
	connection *amqp.Connection
	channel    *amqp.Channel
	config     *AMQPConfig
}

// AMQPConnection implements the connfx.Connection interface for AMQP connections.
type AMQPConnection struct {
	adapter  *AMQPAdapter
	protocol string
	state    int32 // atomic field for connection state
}

// NewAMQPConnection creates a new AMQP connection.
func NewAMQPConnection(protocol string, config *AMQPConfig) *AMQPConnection {
	if config == nil {
		config = NewDefaultAMQPConfig()
	}

	adapter := &AMQPAdapter{
		connection: nil,
		channel:    nil,
		config:     config,
	}

	return &AMQPConnection{
		adapter:  adapter,
		protocol: protocol,
		state:    int32(ConnectionStateNotInitialized),
	}
}

// Connection interface implementation.
func (ac *AMQPConnection) GetBehaviors() []ConnectionBehavior {
	return []ConnectionBehavior{
		ConnectionBehaviorStateful,
		ConnectionBehaviorStreaming,
	}
}

func (ac *AMQPConnection) GetCapabilities() []ConnectionCapability {
	return []ConnectionCapability{
		ConnectionCapabilityQueue,
	}
}

func (ac *AMQPConnection) GetProtocol() string {
	return ac.protocol
}

func (ac *AMQPConnection) GetState() ConnectionState {
	return ConnectionState(atomic.LoadInt32(&ac.state))
}

func (ac *AMQPConnection) HealthCheck(ctx context.Context) *HealthStatus {
	start := time.Now()

	status := &HealthStatus{
		Timestamp: start,
		State:     ac.GetState(),
		Error:     nil,
		Message:   "",
		Latency:   0,
	}

	err := ac.adapter.ensureConnection()
	if err != nil {
		status.State = ConnectionStateError
		status.Error = err
		status.Message = fmt.Sprintf("Failed to connect to AMQP: %v", err)
		status.Latency = time.Since(start)

		return status
	}

	status.State = ConnectionStateReady
	status.Message = "AMQP connection is ready"
	status.Latency = time.Since(start)

	return status
}

func (ac *AMQPConnection) Close(ctx context.Context) error {
	atomic.StoreInt32(&ac.state, int32(ConnectionStateDisconnected))

	if ac.adapter.channel != nil {
		err := ac.adapter.channel.Close()
		if err != nil {
			return fmt.Errorf("%w (channel): %w", ErrFailedToCloseAMQPClient, err)
		}
	}

	if ac.adapter.connection != nil {
		err := ac.adapter.connection.Close()
		if err != nil {
			return fmt.Errorf("%w (connection): %w", ErrFailedToCloseAMQPClient, err)
		}
	}

	return nil
}

func (ac *AMQPConnection) GetRawConnection() any {
	return ac.adapter
}

// QueueRepository interface implementation.
func (aa *AMQPAdapter) QueueDeclare(ctx context.Context, name string) (string, error) {
	err := aa.ensureConnection()
	if err != nil {
		return "", fmt.Errorf("%w (queue=%q): %w", ErrAMQPClientNotInitialized, name, err)
	}

	queue, err := aa.channel.QueueDeclare(
		name,  // queue name
		false, // durable
		false, // delete when unused
		false, // exclusive
		false, // no-wait
		nil,   // arguments
	)
	if err != nil {
		return "", fmt.Errorf("%w (queue=%q): %w", ErrFailedToDeclareQueue, name, err)
	}

	return queue.Name, nil
}

func (aa *AMQPAdapter) QueueDeclareWithConfig(
	ctx context.Context,
	name string,
	config QueueConfig,
) (string, error) {
	err := aa.ensureConnection()
	if err != nil {
		return "", fmt.Errorf("%w (queue=%q): %w", ErrAMQPClientNotInitialized, name, err)
	}

	args := amqp.Table{}

	// Copy additional arguments
	if config.Args != nil {
		maps.Copy(args, config.Args)
	}

	// Add TTL if specified
	if config.MessageTTL > 0 {
		ttlMs := config.MessageTTL.Milliseconds()
		if ttlMs > maxInt32 {
			return "", fmt.Errorf(
				"%w: message TTL %d ms exceeds maximum",
				ErrIntegerOverflow,
				ttlMs,
			)
		}

		args["x-message-ttl"] = int32(ttlMs)
	}

	// Add max length if specified
	if config.MaxLength > 0 {
		if config.MaxLength > maxInt32 {
			return "", fmt.Errorf(
				"%w: max length %d exceeds maximum",
				ErrIntegerOverflow,
				config.MaxLength,
			)
		}

		args["x-max-length"] = int32(config.MaxLength)
	}

	queue, err := aa.channel.QueueDeclare(
		name,
		config.Durable,
		config.AutoDelete,
		config.Exclusive,
		false, // no-wait
		args,
	)
	if err != nil {
		return "", fmt.Errorf("%w (queue=%q): %w", ErrFailedToDeclareQueue, name, err)
	}

	return queue.Name, nil
}

func (aa *AMQPAdapter) Publish(ctx context.Context, queueName string, body []byte) error {
	return aa.PublishWithHeaders(ctx, queueName, body, nil)
}

func (aa *AMQPAdapter) PublishWithHeaders(
	ctx context.Context,
	queueName string,
	body []byte,
	headers map[string]any,
) error {
	err := aa.ensureConnection()
	if err != nil {
		return fmt.Errorf("%w (queue=%q): %w", ErrAMQPClientNotInitialized, queueName, err)
	}

	publishing := amqp.Publishing{ //nolint:exhaustruct
		ContentType: "application/octet-stream",
		Body:        body,
	}

	if headers != nil {
		publishing.Headers = amqp.Table(headers)
	}

	err = aa.channel.PublishWithContext(
		ctx,
		"",        // exchange
		queueName, // routing key
		false,     // mandatory
		false,     // immediate
		publishing,
	)
	if err != nil {
		return fmt.Errorf("%w (queue=%q): %w", ErrFailedToPublishMessage, queueName, err)
	}

	return nil
}

func (aa *AMQPAdapter) Consume(
	ctx context.Context,
	queueName string,
	config ConsumerConfig,
) (<-chan Message, <-chan error) {
	messages := make(chan Message)
	errors := make(chan error)

	go func() {
		defer close(messages)
		defer close(errors)

		aa.consumeLoop(ctx, queueName, config, messages, errors)
	}()

	return messages, errors
}

func (aa *AMQPAdapter) ConsumeWithGroup(
	ctx context.Context,
	queueName string,
	consumerGroup string,
	consumerName string,
	config ConsumerConfig,
) (<-chan Message, <-chan error) {
	// AMQP doesn't have native consumer groups like Redis Streams
	// We'll use the regular consume method
	return aa.Consume(ctx, queueName, config)
}

func (aa *AMQPAdapter) ClaimPendingMessages(
	ctx context.Context,
	queueName string,
	consumerGroup string,
	consumerName string,
	minIdleTime time.Duration,
	count int,
) ([]Message, error) {
	// AMQP doesn't support pending message claiming
	return []Message{}, fmt.Errorf(
		"%w: AMQP does not support pending message claiming",
		ErrAMQPUnsupportedOperation,
	)
}

func (aa *AMQPAdapter) AckMessage(
	ctx context.Context,
	queueName, consumerGroup, receiptHandle string,
) error {
	// In AMQP, acknowledgment is handled through the message's Ack method
	// This is a no-op for compatibility
	return nil
}

func (aa *AMQPAdapter) DeleteMessage(ctx context.Context, queueName, receiptHandle string) error {
	// AMQP doesn't support individual message deletion after consumption
	return fmt.Errorf(
		"%w: AMQP does not support individual message deletion",
		ErrAMQPUnsupportedOperation,
	)
}

// Private methods (unexported) - placed after all exported methods.

// ensureConnection ensures we have an active AMQP connection.
func (aa *AMQPAdapter) ensureConnection() error {
	if aa.connection != nil && !aa.connection.IsClosed() {
		return nil
	}

	conn, err := amqp.Dial(aa.config.URL)
	if err != nil {
		return fmt.Errorf("%w: %w", ErrFailedToCreateAMQPClient, err)
	}

	channel, err := conn.Channel()
	if err != nil {
		closeErr := conn.Close()
		if closeErr != nil {
			return fmt.Errorf(
				"%w (channel): %w, close error: %w",
				ErrFailedToCreateAMQPClient,
				err,
				closeErr,
			)
		}

		return fmt.Errorf("%w (channel): %w", ErrFailedToCreateAMQPClient, err)
	}

	aa.connection = conn
	aa.channel = channel

	return nil
}

// consumeLoop handles the message consumption loop with reconnection logic.
func (aa *AMQPAdapter) consumeLoop(
	ctx context.Context,
	queueName string,
	config ConsumerConfig,
	messages chan<- Message,
	errors chan<- error,
) {
	err := aa.ensureConnection()
	if err != nil {
		select {
		case errors <- fmt.Errorf("%w (queue=%q): %w", ErrAMQPClientNotInitialized, queueName, err):
		case <-ctx.Done():
		}

		return
	}

	deliveries, err := aa.channel.Consume(
		queueName, // queue
		"",        // consumer
		config.AutoAck,
		config.Exclusive,
		config.NoLocal,
		config.NoWait,
		amqp.Table(config.Args),
	)
	if err != nil {
		select {
		case errors <- fmt.Errorf("%w (operation=consume, queue=%q): %w", ErrAMQPOperation, queueName, err):
		case <-ctx.Done():
		}

		return
	}

	aa.processMessages(ctx, deliveries, messages, errors)
}

// processMessages handles message processing for a single connection session.
func (aa *AMQPAdapter) processMessages(
	ctx context.Context,
	deliveries <-chan amqp.Delivery,
	messages chan<- Message,
	errors chan<- error,
) {
	for {
		select {
		case <-ctx.Done():
			return
		case delivery, ok := <-deliveries:
			if !ok {
				select {
				case errors <- ErrDeliveryChannelClosed:
				case <-ctx.Done():
				}

				return
			}

			msg := aa.createMessage(delivery)

			select {
			case messages <- msg:
			case <-ctx.Done():
				return
			}
		}
	}
}

// createMessage creates a connfx.Message from an AMQP delivery.
func (aa *AMQPAdapter) createMessage(delivery amqp.Delivery) Message {
	headers := make(map[string]any)

	if delivery.Headers != nil {
		maps.Copy(headers, delivery.Headers)
	}

	msg := Message{ //nolint:exhaustruct
		Headers:       headers,
		Body:          delivery.Body,
		ReceiptHandle: strconv.FormatUint(delivery.DeliveryTag, 10),
		MessageID:     delivery.MessageId,
		Timestamp:     delivery.Timestamp,
		DeliveryCount: int(delivery.DeliveryTag),
	}

	msg.SetAckFunc(func() error {
		return delivery.Ack(false)
	})

	msg.SetNackFunc(func(requeue bool) error {
		return delivery.Nack(false, requeue)
	})

	return msg
}

// AMQPConnectionFactory creates AMQP connections.
type AMQPConnectionFactory struct {
	protocol string
}

// NewAMQPConnectionFactory creates a new AMQP connection factory for a specific protocol.
func NewAMQPConnectionFactory(protocol string) *AMQPConnectionFactory {
	return &AMQPConnectionFactory{
		protocol: protocol,
	}
}

func (f *AMQPConnectionFactory) CreateConnection( //nolint:ireturn
	ctx context.Context,
	config *ConfigTarget,
) (Connection, error) {
	amqpConfig := &AMQPConfig{
		URL: config.DSN,
	}

	if amqpConfig.URL == "" {
		amqpConfig.URL = NewDefaultAMQPConfig().URL
	}

	conn := NewAMQPConnection(f.protocol, amqpConfig)

	// Test the connection
	status := conn.HealthCheck(ctx)
	if status.State == ConnectionStateError {
		return nil, fmt.Errorf("%w: %w", ErrAMQPConnectionFailed, status.Error)
	}

	return conn, nil
}

func (f *AMQPConnectionFactory) GetProtocol() string {
	return f.protocol
}
