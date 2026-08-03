/* MMM-CTA — MMM-CTA.js
 * woah! a human wrote 100% of this!
 */

Module.register("MMM-CTA", {
	defaults: {
		apiKey: "",
		mapId: 40170,               // Example Stop, Ashland Pink Line, find the stop for you from the CTA train api!
		route: "Pink",              // color of the line: Red|Blue|Brn|G|Org|P|Pink|Y
		maxResults: 8,              // CTA caps mapid/rt/stpid at 4 values each, not results
		updateInterval: 30 * 1000,  // request every 30 seconds. This is 2,880 req/day against a 100,000/day cap, feel free todo more but this worked fine for me.
		requestTimeout: 8 * 1000,
		animationSpeed: 1000,
		showDestination: true,
		showRun: false,             // train run number; useful for debugging, noise otherwise
		showPlatform: true,         // stpDe, e.g. "Service toward Loop"
		dueThreshold: 1,            // minutes at or below which we print "Due"
		staleAfter: 3 * 60 * 1000,  // dim the whole table if no good fetch in this long
		countdownMode: "hybrid"
	},

	getStyles () {
		return ["MMM-CTA.css"];
	},

	start () {
		this.arrivals = [];
		this.errorMessage = null;
		this.generated = null;
		this.fetchedAt = 0;
		this.loaded = false;

		if (!this.config.apiKey) {
			this.errorMessage = "No CTA API key configured";
			Log.error("MMM-CTA: apiKey is empty; nothing will be fetched.");
			return;
		}

		this.sendSocketNotification("CTA_START", {
			identifier: this.identifier,
			config: this.config
		});

		setInterval(() => {
			if (this.loaded) this.updateDom();
		}, 10 * 1000);
	},

	socketNotificationReceived (notification, payload) {
		if (payload?.identifier !== this.identifier) return;

		if (notification === "CTA_ARRIVALS") {
			this.arrivals = payload.arrivals;
			this.generated = payload.generated;
			this.fetchedAt = payload.fetchedAt;
			this.errorMessage = null;
			this.loaded = true;
			this.updateDom(this.animationSpeed);
		} else if (notification === "CTA_ERROR") {
			this.errorMessage = payload.message;
			this.loaded = true;
			this.updateDom(this.animationSpeed);
		}
	},

	/**
	 * CTA timestamps carry no UTC offset. JSON output is "2015-04-30T20:23:53";
	 * the XML path from da docs shows me "20110321 18:32:02". 
	 */
	parseCtaTime (value) {
		if (!value) return NaN;
		const compact = /^(\d{4})(\d{2})(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(value);
		if (compact) {
			const [, y, mo, d, h, mi, s] = compact;
			return new Date(+y, +mo - 1, +d, +h, +mi, +s).getTime();
		}
		return new Date(value).getTime();
	},

	minutesUntil (arrival) {
		const arr = this.parseCtaTime(arrival.arrivesAt);
		const prd = this.parseCtaTime(arrival.predictedAt);
		if (Number.isNaN(arr)) return null;

		let ms;
		switch (this.config.countdownMode) {
			case "prdt":
				ms = arr - prd;
				break;
			case "now":
				ms = arr - Date.now();
				break;
			case "hybrid":
			default:
				ms = (arr - prd) - (Date.now() - this.fetchedAt);
				break;
		}
		return Math.max(0, Math.round(ms / 60000));
	},

	isStale () {
		return Date.now() - this.fetchedAt > this.config.staleAfter;
	},

	getDom () {
		const wrapper = document.createElement("div");
		wrapper.className = "mmm-cta";

		if (!this.loaded) {
			wrapper.className += " dimmed light small";
			wrapper.textContent = "Loading CTA arrivals…";
			return wrapper;
		}

		if (this.errorMessage && this.arrivals.length === 0) {
			wrapper.className += " dimmed light small";
			wrapper.textContent = `CTA: ${this.errorMessage}`;
			return wrapper;
		}

		if (this.arrivals.length === 0) {
			wrapper.className += " dimmed light small";
			wrapper.textContent = "No predictions available";
			return wrapper;
		}

		const table = document.createElement("table");
		table.className = "small mmm-cta-table";
		if (this.isStale()) table.classList.add("mmm-cta-stale");

		for (const a of this.arrivals) {
			const row = document.createElement("tr");
			if (a.isDelayed) row.classList.add("mmm-cta-delayed");

			const line = document.createElement("td");
			line.className = "mmm-cta-line";
			line.textContent = "\u25CF"; 
			line.classList.add(`mmm-cta-route-${String(a.route).toLowerCase()}`);
			row.appendChild(line);

			const dest = document.createElement("td");
			dest.className = "mmm-cta-dest";
			const bits = [];
			if (this.config.showRun) bits.push(`#${a.run}`);
			if (this.config.showDestination) bits.push(`to ${a.destination}`);
			if (this.config.showPlatform) bits.push(a.stopDescription);
			dest.textContent = bits.join(" · ");
			row.appendChild(dest);

			const flags = document.createElement("td");
			flags.className = "mmm-cta-flags dimmed xsmall";
			const marks = [];
			if (a.isScheduled) marks.push("sched");   
			if (a.isFault) marks.push("fault");      
			if (a.isDelayed) marks.push("delayed");   
			flags.textContent = marks.join(" ");
			row.appendChild(flags);

			const eta = document.createElement("td");
			eta.className = "mmm-cta-eta bright";
			const mins = this.minutesUntil(a);
			if (a.isDelayed) {
				eta.textContent = "Delayed";
			} else if (a.isApproaching || (mins !== null && mins <= this.config.dueThreshold)) {
				eta.textContent = "Due";
			} else if (mins === null) {
				eta.textContent = "—";
			} else {
				eta.textContent = `${mins} min`;
			}
			row.appendChild(eta);

			table.appendChild(row);
		}

		wrapper.appendChild(table);

		if (this.errorMessage) {
			const note = document.createElement("div");
			note.className = "dimmed xsmall mmm-cta-note";
			note.textContent = `stale — ${this.errorMessage}`;
			wrapper.appendChild(note);
		}

		return wrapper;
	}
});
