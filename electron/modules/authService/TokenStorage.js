class TokenStorage {
  constructor() {
    this.observers = [];
  }

  subscribe(observer) {
    this.observers.push(observer);
  }

  unsubscribe(observer) {
    this.observers = this.observers.filter((obs) => obs !== observer);
  }

  notifyTokenChange(tokens) {
    this.observers.forEach((observer) => {
      observer.onTokenChange(tokens);
    });
  }
}
