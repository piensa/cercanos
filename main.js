// Before running ths, we need:
// npm install flatbush progress geographiclib minimist
//
const Flatbush = require('flatbush');
const fs = require('fs');
const ProgressBar = require('progress');
const GeographicLib = require('geographiclib');
const args = require('minimist')(process.argv.slice(2));

function createIndexFromFile(filename) {
    const contents =  JSON.parse(fs.readFileSync(filename));
    const count = contents.features.length;
    const index = new Flatbush(count);
    const data = new Array(count);
    const name = filename.split('.')[0];

    const bar = new ProgressBar(`Loading ${filename} [:bar] :rate/pps :percent :etas (${count} items)`, {
        complete: '=',
        incomplete: ' ',
        width: 40,
        total: count
    });

    for (let [currentIndex, feature] of contents.features.entries()) {
        bar.tick(1);
        let d = feature.properties;
	let x = feature.geometry.coordinates[0];
	let y = feature.geometry.coordinates[1];
	d.x = x;
	d.y = y;
        data[currentIndex] = d;
        index.add(d, d, x, y);
    }

    index.finish();

    return {
        name,
        index,
        data
    }
}

function distance(lat1, lon1, lat2, lon2){
    const geod = GeographicLib.Geodesic.WGS84;
    const r = geod.Inverse(lat1, lon1, lat2, lon2);
    return Number(r.s12.toFixed(3));
}

function best(x, y, items) {
    let best_item = items[0];
    let best_d = distance(y, x, best_item.y, best_item.x);

    for (let i=0; i < items.length; i++ ) {
        let new_d = distance(y, x, items[i].y, items[i].x);
        if (new_d < best_d) {
            best_d = new_d;
            best_item = items[i];
        }
    }
    return best_item;
}

function getTargetDistance(target, meanX, meanY, candidates, c) {
    const all = target.index.neighbors(meanX, meanY, candidates).map(i => target.data[i]);
    const theBest = best(c.x, c.y, all);
    const dist = distance(meanY, meanX, theBest.y, theBest.x);
    return {
        [`${target.name}dst`] : dist,
        [`${target.name}x`] : theBest.x,
        [`${target.name}y`] : theBest.y,
        [`${target.name}cat`] : theBest["cat"]
    };
}


(function (){
    const d = 0.00045;
    // half-line distance
    // d=100 m,
    const dx = d*4;
    const dy = d*4;
    // const dx = 0.0064; // 0.7 km lon
    // const dy = 0.0063; // 0.7 km lat

    // read file
    const cluster500 = createIndexFromFile(args.c);

    const targets = args.t.map(createIndexFromFile);

    const dataLength = cluster500.data.length;
    const clusters = [];
    const bar = new ProgressBar('Processing clusters [:bar] :rate/pps :percent :etas', {
        complete: '=',
        incomplete: ' ',
        width: 40,
        total: dataLength
    });

    for(let i = 0; i < dataLength; ++i) {
        bar.tick(1);
        const c = cluster500.data[i];

        const meanX = c.x;
        const meanY = c.y;

        const candidates = 15;

        const distList = targets.map(target => getTargetDistance(target, meanX, meanY, candidates, c))
        const n = Object.assign({}, ...distList);

	const properties = {...c, ...n};
	const feature = { type: "Feature",
		          properties: properties,
		          geometry: {
		                  type: "Point",
				  coordinates: [c.x, c.y ]
			  },
	                }
        clusters.push(feature);
    }

    console.log(`Total clusters: ${clusters.length}`);
    let out = {
       type: "FeatureCollection",
       features: clusters
    }
    fs.writeFileSync(args.o, JSON.stringify(out) );
})();
