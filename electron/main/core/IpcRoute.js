export class IpcRoute {
    constructor(prefix ="") {
        this.prefix = prefix;
    }

    build(eventName){
        return `${this.prefix}:${eventName}`;
    }
}