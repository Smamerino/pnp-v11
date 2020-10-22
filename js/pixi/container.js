import { Pointer, Ping } from "./pointer.js";
import { TweenMax } from '/scripts/greensock/esm/all.js';
import { PointerSettingsMenu } from '../settings/settings.js';

export class PointerContainer extends PIXI.Container {
	constructor() {
		super();
		this.initUsers();

		this._socket = 'module.pointer';
	}

	get deltaTime() {
		return 1000 / 6;
	}

	static init() {
		// called inside the ready hook, so settings are registered.
		// ready hook *always* is supposed to come after the canvasReady hook
		if (canvas)
			canvas.controls.pointer = canvas.controls.addChild(new PointerContainer());

		window.addEventListener('mousemove', PointerContainer.trackMousePos);
		game.socket.on('module.pointer', PointerContainer.socketHandler);
		// but ready comes only during initialization
		// so we need to take care of future scene changes (or other reasons for canvas rerenders)
		Hooks.on('canvasReady', () => {
			if (canvas.controls.pointer) canvas.controls.pointer.destroy();

			canvas.controls.pointer = canvas.controls.addChild(new PointerContainer())
		});
	}

	async initUsers() {
    this._users = {}
		for (let user of game.users) {
			const data = this._getUserPointerData(user);
			const pointer = this.addChild(new Pointer(data.pointer));
			const ping = this.addChild(new Ping(data.ping));
			ping.hide();
			pointer.hide();
			this._users[user.id] = {pointer, ping};
		}
	}

	_getUserPointerData(user) {
		const collection = game.settings.get('pointer', 'collection');
		const settings = mergeObject(PointerSettingsMenu.defaultSettings, user.getFlag('pointer', 'settings'));
		const pointerData = collection.find(e => e.id === settings.pointer) || collection.find(e => e.default === 'pointer') || collection[0];
		const pingData = collection.find(e => e.id === settings.ping) || collection.find(e => e.default === 'ping') || collection[0];
		return {pointer: pointerData, ping: pingData}
	}

	update(user) {
		const data = this._getUserPointerData(user);
		this._users[user.id].pointer.update(data.pointer);
		this._users[user.id].ping.update(data.ping);
	}

	updateUserColor(user) {
		this._users[user.id].pointer.update({'tint.user': user.data.color});
		this._users[user.id].ping.update({'tint.user': user.data.color});
	}

	static trackMousePos(ev) {
		canvas.controls.pointer.mouse = {
			x: ev.clientX,
			y: ev.clientY
		};
	}

	getWorldCoord(pos = this.mouse) {
		// const t = this.worldTransform;
    const t = canvas.stage.worldTransform;

		return {
			x: (pos.x - t.tx) / canvas.stage.scale.x,
			y: (pos.y - t.ty) / canvas.stage.scale.y
		}
	}

	ping({userId = game.user.id, position = this.getWorldCoord(), force = false, scale = canvas.stage.scale.x}={}) {
		const ping = this._users[userId].ping;
		ping.update({position}); 

		if (force) {
			canvas.animatePan({x: position.x, y: position.y, scale: scale});
		}


		if (userId !== game.user.id) return;
		
		const data = {
			senderId: userId,
			position: position,
			sceneId: canvas.scene._id,
			type: "ping",
			force: force,
			scale: canvas.stage.scale.x
		}
		game.socket.emit(this._socket, data);
	}

	destroy(options) {
		super.destroy(options);
	}

	static socketHandler(data) {
		if (data.stop) {
			canvas.controls.pointer.hidePointer(data.senderId);
			return;
		}
		else if (data.sceneId !== canvas.scene.id) return;
		else if (data.type  === 'pointer')
			canvas.controls.pointer.movePointer(data.senderId, data.position);
		else if (data.type === 'ping')
			canvas.controls.pointer.ping({userId: data.senderId, position: data.position, force: data.force, scale: data.scale})
	}

	movePointer(userId, {x, y}) {
		const pointer = this._users[userId].pointer;
		if (pointer.renderable) { // only animate if already visible
			TweenMax.to(pointer.position, this.deltaTime / 1000, {x, y, ease: 'Sine.out'});
		} else {
			pointer.renderable = true;
			this._users[userId].pointer.update({position: {x, y}});
		}		
	}

	hidePointer(userId) {
		const pointer = this._users[userId].pointer;
		pointer.hide();
	}

	start() {
		this._onMouseMove = ev => this._mouseMove(ev);
		this.lastTime = 0;
		this._mouseMove();
		window.addEventListener('mousemove', this._onMouseMove);
		this._users[game.user.id].pointer.renderable = true;
	}

	stop() {
		window.removeEventListener('mousemove', this._onMouseMove);
		this._users[game.user.id].pointer.renderable = false;
		const data = {
			senderId: game.user._id,
			stop: true
		}
		game.socket.emit(this._socket, data);
	}

	_mouseMove(ev) {
		const t = this.worldTransform,
        	x = (this.mouse.x - t.tx) / canvas.stage.scale.x,
					y = (this.mouse.y - t.ty) / canvas.stage.scale.y; 

		this._users[game.user.id].pointer.update({position: {x, y}});

		const dt = Date.now() - this.lastTime;
		if (dt < this.deltaTime) // 30 times per second
			return;

		let mdata = {
			senderId: game.user._id,
			position: {x,y},
			sceneId: canvas.scene._id,
			type: "pointer"
		}
		game.socket.emit(this._socket, mdata);
	}
}