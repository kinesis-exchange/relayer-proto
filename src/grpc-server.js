const grpc = require('grpc');
const path = require('path');

const GrpcAction = require('./grpc-action');
const GrpcMarketAction = require('./grpc-market-action');
const { createOrder, placeOrder, cancelOrder, subscribeFill, executeOrder, completeOrder } = require('./maker');
const { createFill, fillOrder, subscribeExecute } = require('./taker');
const { watchMarket, MarketEventPublisher } = require('./orderbook');
const { MessageBox } = require('./messaging');

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const GRPC_HOST = process.env.GRPC_HOST || '0.0.0.0';
const GRPC_PORT = process.env.GRPC_PORT || '50078';
const PROTO_PATH = path.resolve('relayer.proto');
const PROTO_GRPC_TYPE = 'proto';
const PROTO_GRPC_OPTIONS = {
  convertFieldsToCamelCase: true,
  binaryAsBase64: true,
  longsAsStrings: true,
};

/**
 * Abstract class for a grpc server
 *
 * @author kinesis
 */
class GrpcServer {
  constructor(logger, eventHandler, engine) {
    this.engine = engine;
    this.logger = logger;
    this.eventHandler = eventHandler;
    this.marketEventPublisher = new MarketEventPublisher(this.eventHandler);
    this.messenger = new MessageBox({ host: REDIS_HOST });
    this.server = new grpc.Server();
    this.proto = grpc.load(PROTO_PATH, PROTO_GRPC_TYPE, PROTO_GRPC_OPTIONS);

    this.makerService = this.proto.Maker.service;
    this.takerService = this.proto.Taker.service;
    this.orderBookService = this.proto.OrderBook.service;

    this.action = new GrpcAction(this.eventHandler, this.messenger, this.logger, this.engine);
    this.marketAction = new GrpcMarketAction(this.marketEventPublisher, this.eventHandler, this.logger, this.engine);

    this.server.addService(this.makerService, {
      createOrder: createOrder.bind(this.action),
      placeOrder: placeOrder.bind(this.action),
      cancelOrder: cancelOrder.bind(this.action),
      subscribeFill: subscribeFill.bind(this.action),
      executeOrder: executeOrder.bind(this.action),
      completeOrder: completeOrder.bind(this.action),
    });

    this.server.addService(this.takerService, {
      createFill: createFill.bind(this.action),
      fillOrder: fillOrder.bind(this.action),
      subscribeExecute: subscribeExecute.bind(this.action),
    });

    this.server.addService(this.orderBookService, {
      watchMarket: watchMarket.bind(this.marketAction),
    });
  }

  /**
   * Binds a given port/host to our grpc server
   *
   * @param {String} host
   * @param {String} port
   * @returns {void}
   */
  listen(host = GRPC_HOST, port = GRPC_PORT) {
    this.server.bind(`${host}:${port}`, grpc.ServerCredentials.createInsecure());
    this.server.start();
    this.logger.info('gRPC server started', { host, port });
  }
}

module.exports = GrpcServer;
