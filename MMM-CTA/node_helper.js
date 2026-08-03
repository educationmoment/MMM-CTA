/* MMM-CTA — node_helper.js
 * API reference: CTA Train Tracker API documentation v1.46 (04-Aug-2024)
 */

const NodeHelper = require("node_helper");
const Log = require("logger");

const ARRIVALS_URL = "https://lapi.transitchicago.com/api/1.0/ttarrivals.aspx";

module.exports = NodeHelper.create({
	start () {
		this.timers = {};
		Log.log(`${this.name} helper started`);
	},

	stop () {
		for (const id of Object.keys(this.timers)) {
			clearInterval(this.timers[id]);
		}
		this.timers = {};
	},

	socketNotificationReceived (notification, payload) {
		if (notification !== "CTA_START") return;

		const { identifier, config } = payload;

		if (this.timers[identifier]) clearInterval(this.timers[identifier]);

		this.fetchArrivals(identifier, config);
		this.timers[identifier] = setInterval(
			() => this.fetchArrivals(identifier, config),
			config.updateInterval
		);
	},

	async fetchArrivals (identifier, config) {
		const url = new URL(ARRIVALS_URL);
		url.searchParams.set("key", config.apiKey);
		url.searchParams.set("mapid", String(config.mapId));
		url.searchParams.set("max", String(config.maxResults));
		url.searchParams.set("outputType", "JSON");

		if (config.route) url.searchParams.set("rt", config.route);

		try {
			const res = await fetch(url, {
				signal: AbortSignal.timeout(config.requestTimeout),
				headers: { "User-Agent": "MagicMirror-MMM-CTA" }
			});

			if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

			const body = await res.json();
			const ctatt = body?.ctatt;
			if (!ctatt) throw new Error("malformed response: no ctatt root");


			const errCd = Number(ctatt.errCd);
			if (errCd !== 0) {
				throw new Error(`CTA errCd ${errCd}: ${ctatt.errNm ?? "no message"}`);
			}

			const arrivals = this.normalize(ctatt, config);

			this.sendSocketNotification("CTA_ARRIVALS", {
				identifier,
				arrivals,
				generated: ctatt.tmst ?? null,
				fetchedAt: Date.now()
			});
		} catch (err) {
			Log.error(`${this.name} fetch failed: ${err.message}`);
			this.sendSocketNotification("CTA_ERROR", {
				identifier,
				message: err.message,
				fetchedAt: Date.now()
			});
		}
	},

	normalize (ctatt, config) {
		const raw = ctatt.eta ?? [];
		const etas = Array.isArray(raw) ? raw : [raw];

		return etas
			.filter((e) => !config.route || String(e.rt).toLowerCase() === config.route.toLowerCase())
			.map((e) => ({
				stationId: e.staId,
				stopId: e.stpId,
				stationName: e.staNm,
				stopDescription: e.stpDe,
				run: e.rn,
				route: e.rt,
				destination: e.destNm,
				direction: Number(e.trDr),
				predictedAt: e.prdt,
				arrivesAt: e.arrT,
				isApproaching: e.isApp === "1",
				isScheduled: e.isSch === "1",   
				isDelayed: e.isDly === "1",     
				isFault: e.isFlt === "1"        
			}))
			.sort((a, b) => a.arrivesAt.localeCompare(b.arrivesAt));
	}
});
