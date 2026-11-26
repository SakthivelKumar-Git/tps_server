export const seedBrands = [
  {
    id: "grundfos",
    name: "GRUNDFOS",
    category: "Water Pumps & Pressure Boosters",
    description: "Global pioneer in advanced pump solutions and water technology, renowned for energy-efficient booster pumps, domestic pressure systems, and industrial circulation pumps.",
    tagline: "Pioneering solutions to the world's water and climate challenges",
    origin: "Denmark",
    authorizedPartner: true,
    logoUrl: "/assets/brands/grundfos.svg",
    categories: ["Pressure Pumps", "Water Pumps", "Industrial Pumps"]
  },
  {
    id: "koel",
    name: "KOEL Electric",
    category: "Pumps & Electric Motors",
    description: "Kirloskar Oil Engines Limited (KOEL) provides heavy-duty electric motors, openwell submersibles, and monobloc pumps built for demanding agricultural, commercial, and industrial service.",
    tagline: "Engineering excellence and high-torque electric power",
    origin: "India",
    authorizedPartner: true,
    logoUrl: "/assets/brands/koel.svg",
    categories: ["Pumps & Motors", "Water Pumps"]
  },
  {
    id: "ventura",
    name: "Ventura",
    category: "Pumps & Hydro-Pneumatic Systems",
    description: "Trusted manufacturer of domestic self-priming pumps, borewell submersibles, and quiet booster pumps tailored for reliable Indian domestic and building water supply.",
    tagline: "Smooth hydro-power for residences and commercial spaces",
    origin: "India",
    authorizedPartner: true,
    logoUrl: "/assets/brands/ventura.svg",
    categories: ["Pressure Pumps", "Water Pumps"]
  },
  {
    id: "spark-3x",
    name: "SPARK-3X",
    category: "Heat Pumps & Water Heating",
    description: "Specialists in state-of-the-art domestic and commercial heat pump water heaters, utilizing high-efficiency thermodynamic cycles for up to 75% energy savings.",
    tagline: "Next-generation thermodynamic water heating efficiency",
    origin: "India",
    authorizedPartner: true,
    logoUrl: "/assets/brands/spark3x.svg",
    categories: ["Heat Pumps", "Water Heaters"]
  },
  {
    id: "racold",
    name: "Racold",
    category: "Water Heaters, Solar & Heat Pumps",
    description: "India's premier water heating specialist offering cutting-edge electric storage geysers, high-performance solar water heaters, and domestic heat pump systems.",
    tagline: "Reborn everyday with hot water engineering excellence",
    origin: "India / Ariston Group",
    authorizedPartner: true,
    logoUrl: "/assets/brands/racold.svg",
    categories: ["Water Heaters", "Solar Water Heaters", "Heat Pumps"]
  },
  {
    id: "v-guard",
    name: "V-Guard",
    category: "Solar & Heat Pumps",
    description: "Leading consumer engineering giant delivering robust evacuated tube collector (ETC) & flat plate collector (FPC) solar water heaters, hybrid heat pumps, and water solutions.",
    tagline: "Reliable engineering engineered for Indian climatic resilience",
    origin: "India",
    authorizedPartner: true,
    logoUrl: "/assets/brands/vguard.svg",
    categories: ["Solar Water Heaters", "Heat Pumps", "Water Heaters"]
  },
  {
    id: "wisy",
    name: "WISY",
    category: "Rain Water Filters",
    description: "German-engineered rainwater harvesting filtration systems utilizing vortex technology to extract clean water with self-cleaning stainless steel mesh down to 0.28mm.",
    tagline: "Precision German vortex rainwater harvesting technology",
    origin: "Germany",
    authorizedPartner: true,
    logoUrl: "/assets/brands/wisy.svg",
    categories: ["Rainwater Filters"]
  },
  {
    id: "sinicon",
    name: "SINICON",
    category: "Pump Controllers & Automation",
    description: "Pioneering electronic pump controllers, automated water level controllers, dry-run protection units, and digital pressure switches ensuring pump longevity.",
    tagline: "Smart electronic automation for water pumping systems",
    origin: "India",
    authorizedPartner: true,
    logoUrl: "/assets/brands/sinicon.svg",
    categories: ["Pump Controllers"]
  },
  {
    id: "3m",
    name: "3M",
    category: "Water Softeners & Filtration",
    description: "World-class water softening and purification solutions featuring intelligent resin regeneration, scale prevention for plumbing, appliances, and skin health.",
    tagline: "Science applied to life: soft, crystal-clear water",
    origin: "USA",
    authorizedPartner: true,
    logoUrl: "/assets/brands/3m.svg",
    categories: ["Water Softeners"]
  }
];

export const seedProducts = [
  {
    id: "grundfos-scala2",
    name: "Grundfos SCALA2 Intelligent Booster Pump",
    slug: "grundfos-scala2-intelligent-booster",
    brand: "GRUNDFOS",
    category: "Pressure Pumps",
    featured: true,
    image: "/assets/images/grundfos-scala2.jpg",
    shortDescription: "Compact, fully integrated water booster pump delivering constant water pressure to all taps, even when several taps are opened simultaneously.",
    overview: "The Grundfos SCALA2 is a robust, self-priming water booster pump designed for domestic applications. With an integrated sensor, variable speed drive, and intelligent pump control, the SCALA2 constantly monitors discharge pressure and adjusts motor speed accordingly to provide perfect water pressure in up to 3 floors and 8 taps.",
    keyFeatures: [
      "Intelligent pump control automatically adjusts motor speed to match demand",
      "Extremely quiet operation (under 47 dB(A) in typical use)",
      "Compact all-in-one unit with motor, tank, sensor, and non-return valve",
      "Integrated dry-running protection and anti-cycling protection",
      "Self-priming capability up to 8 meters suction lift"
    ],
    technicalSpecifications: {
      "Rated Flow Rate": "3.0 m³/h (50 L/min)",
      "Max Head": "45 meters",
      "Max Operating Pressure": "10 bar",
      "Power Rating": "550 W (Variable Speed PM Motor)",
      "Voltage": "200-240 V, 50/60 Hz",
      "Enclosure Class": "IPX4D (Outdoor / Indoor rated)",
      "Liquid Temperature Range": "0°C to +45°C",
      "Noise Level": "< 47 dB(A)"
    },
    applications: [
      "Multi-story residential villas & luxury apartments",
      "Pressure boosting from city mains or roof header tanks",
      "Shower heads, jacuzzi, and rain showers requiring stable water pressure",
      "Domestic water supply from shallow wells and break tanks"
    ],
    installationInfo: "Compact plug-and-pump installation. Requires G 1\" inlet and outlet piping with bypass valve recommended for maintenance.",
    warrantyInfo: "Standard manufacturer warranty via True Power Solutions Authorised Channel Support."
  },
  {
    id: "grundfos-cmbe",
    name: "Grundfos CMBE Hydro-Pneumatic Booster Set",
    slug: "grundfos-cmbe-hydro-pneumatic-booster",
    brand: "GRUNDFOS",
    category: "Pressure Pumps",
    featured: true,
    image: "/assets/images/booster-pump-ref.png",
    shortDescription: "High-efficiency variable-speed booster system with stainless steel hydraulics for large residences and light commercial buildings.",
    overview: "Grundfos CMBE is an integrated booster set comprising a high-efficiency stainless steel CME multistage pump, energy-saving permanent magnet motor, integrated frequency converter, 5-way fitting with non-return valve, pressure sensor, and pressure tank.",
    keyFeatures: [
      "All wetted parts in premium grade stainless steel (AISI 304)",
      "Integrated speed control adjusts output to exact water consumption",
      "Built-in thermal and dry-run protection with auto-restart",
      "High energy efficiency exceeding IE4 motor standards",
      "Low sound emission and minimal pipe vibration"
    ],
    technicalSpecifications: {
      "Max Flow": "Up to 8.5 m³/h",
      "Max Head": "Up to 62 meters",
      "Motor Rating": "0.75 kW to 1.5 kW",
      "Operating Pressure": "Up to 10 bar",
      "Supply Voltage": "1x200-240V, 50/60 Hz",
      "Diaphragm Vessel": "2-litre integrated expansion vessel",
      "Protection Class": "IP55"
    },
    applications: [
      "High-end residential bungalows and multi-family residences",
      "Hotels, guest houses, and commercial kitchen facilities",
      "Light industrial process pressure boosting"
    ],
    installationInfo: "Horizontal mounting with anti-vibration rubber pads. Supplied with pre-wired power cord and ready for piping connections.",
    warrantyInfo: "Manufacturer warranty supported by True Power Solutions."
  },
  {
    id: "koel-electric-monobloc",
    name: "KOEL Heavy-Duty Centrifugal Monobloc Pump",
    slug: "koel-heavy-duty-centrifugal-monobloc",
    brand: "KOEL Electric",
    category: "Pumps & Motors",
    featured: true,
    image: "/assets/images/pump-hero.jpg",
    shortDescription: "Industrial-grade high discharge monobloc pump with cast iron casing and copper rotor for relentless water transfer.",
    overview: "Manufactured by Kirloskar Oil Engines Limited (KOEL), these electric monobloc pumps deliver outstanding hydraulic efficiency and high discharge volume. Designed with dynamically balanced rotating parts and high-grade insulation to handle voltage fluctuations in Indian operating conditions.",
    keyFeatures: [
      "High-grade Cast Iron FG 260 volute casing and impeller",
      "100% Electrolytic grade copper winding with high thermal endurance",
      "Double sealed precision ball bearings pre-lubricated with high temp grease",
      "Wide voltage band performance (160V to 240V single phase / 350V to 440V three phase)",
      "High suction lift and smooth hydraulic flow design"
    ],
    technicalSpecifications: {
      "Power Rating": "1.5 kW (2.0 HP) to 7.5 kW (10 HP)",
      "Head Range": "12 to 54 meters",
      "Discharge Capacity": "150 to 1200 LPM",
      "Insulation Class": "Class F / Class B",
      "Supply Phase": "Three Phase 415V / Single Phase 230V, 50 Hz",
      "Shaft": "Stainless Steel AISI 410",
      "Duty Cycle": "S1 Continuous Rating"
    },
    applications: [
      "Commercial building water supply and overhead tank filling",
      "Agricultural irrigation and dairy farms",
      "Industrial water circulation, cooling towers, and boiler feeds",
      "Construction dewatering and utility pumping"
    ],
    installationInfo: "Rigid foundation mounting with suction strainer and non-return valve on suction line.",
    warrantyInfo: "Genuine KOEL manufacturer warranty backed by True Power Solutions technical team."
  },
  {
    id: "spark3x-heat-pump",
    name: "SPARK-3X High-Efficiency Domestic Heat Pump",
    slug: "spark3x-domestic-heat-pump",
    brand: "SPARK-3X",
    category: "Heat Pumps",
    featured: true,
    image: "/assets/images/spark3x-heatpump.jpg",
    shortDescription: "Thermodynamic heat pump water heater providing continuous hot water with 75% electricity savings compared to standard geysers.",
    overview: "The SPARK-3X heat pump extracts renewable ambient thermal energy from the air and transfers it into the water via an eco-friendly refrigerant cycle. Capable of heating water up to 60°C throughout all seasons, delivering unmatched operational cost savings.",
    keyFeatures: [
      "High COP (Coefficient of Performance) up to 4.2 for massive power savings",
      "Eco-friendly R134a / R410A refrigerant",
      "Glass-lined / SS 304 inner tank for superior corrosion protection against hard water",
      "Digital intelligent LCD controller with timer and temperature preset",
      "Titanium enamel heat exchanger for rapid heat transfer"
    ],
    technicalSpecifications: {
      "Storage Capacity": "150L, 200L, 300L & 500L options",
      "Heating Capacity": "3.5 kW to 7.2 kW thermal output",
      "Power Input": "0.85 kW to 1.75 kW electrical",
      "Max Hot Water Temp": "60°C (up to 75°C with auxiliary element)",
      "Operating Ambient Temp": "-7°C to +45°C",
      "Noise Level": "≤ 50 dB(A)",
      "Power Supply": "220-240V / 1Ph / 50Hz"
    },
    applications: [
      "Independent bungalows, villas, and modern residential residences",
      "Multi-bathroom luxury apartments with central hot water loops",
      "Boutique hotels, health clinics, and fitness centres"
    ],
    installationInfo: "Can be installed on terrace, balcony, or utility area with good air circulation.",
    warrantyInfo: "Compressor and tank manufacturer warranty backed by True Power Solutions."
  },
  {
    id: "racold-omnis-lux-plus",
    name: "Racold Omnis Lux Plus Storage Water Heater",
    slug: "racold-omnis-lux-plus-storage-geyser",
    brand: "Racold",
    category: "Water Heaters",
    featured: false,
    image: "/assets/images/racold-geyser.jpg",
    shortDescription: "Smart Wi-Fi enabled water heater with titanium plus coating and silver ion antibacterial technology.",
    overview: "The Racold Omnis Lux Plus is an intelligent storage geyser equipped with Smart Bath Logic that allows users to customize water temperature and save up to 40% electricity. Powered by titanium steel tank technology to withstand 8-bar pressure.",
    keyFeatures: [
      "Smart Wi-Fi connectivity for mobile app control and bath scheduling",
      "Titanium Plus technology with specialized enamel tank coating",
      "Defensor technology for advanced anode protection against hard water corrosion",
      "Silver Ion Technology actively inhibits bacterial growth inside the tank",
      "Rated for 8-bar pressure, suitable for high-rise buildings and pressure pumps"
    ],
    technicalSpecifications: {
      "Capacity": "15 Litres / 25 Litres",
      "Wattage": "2000 W",
      "Pressure Rating": "8 Bar (0.8 MPa)",
      "BEE Star Rating": "5 Star Energy Efficiency",
      "Voltage": "230 V, 50 Hz",
      "Heating Time": "Approx. 20-25 mins for 45°C rise"
    },
    applications: [
      "High-rise residential apartments with centralized pressure booster systems",
      "Individual homes, bathrooms, and modern suites"
    ],
    installationInfo: "Wall-mount installation with high-pressure safety valve and flexible SS braided hoses.",
    warrantyInfo: "Racold genuine product warranty supported by True Power Solutions."
  },
  {
    id: "vguard-solar-water-heater",
    name: "V-Guard Commercial & Domestic Solar Water Heater",
    slug: "vguard-solar-water-heating-system",
    brand: "V-Guard",
    category: "Solar Water Heaters",
    featured: true,
    image: "/assets/images/vguard-solar.jpg",
    shortDescription: "High-grade evacuated tube collector (ETC) solar heating system with insulated SS 304 inner tank for all-weather hot water.",
    overview: "V-Guard Solar Water Heaters harness renewable solar energy with advanced multi-layer coated borosilicate glass evacuated tubes. The high thermal insulation PUF layer maintains water temperature overnight, ensuring boiling hot water at daybreak.",
    keyFeatures: [
      "High absorption 3-target selective coating borosilicate tubes",
      "Heavy gauge stainless steel SS 304L / glass-lined inner tank",
      "High-density injected CFC-free polyurethane foam (PUF) insulation",
      "Galvanized powder-coated support frame designed for wind resistance",
      "Auxiliary electric back-up heater for heavy monsoon / cloudy periods"
    ],
    technicalSpecifications: {
      "Capacity Options": "100 LPD, 200 LPD, 300 LPD, 500 LPD and commercial manifolds",
      "Collector Type": "Evacuated Tube Collector (ETC) / Flat Plate (FPC)",
      "Inner Tank Material": "Stainless Steel SS-304L Grade",
      "Max Operating Pressure": "Standard gravity / Pressurized model options",
      "Outer Cladding": "Powder coated aluminum zinc alloy"
    },
    applications: [
      "Residential rooftop solar water heating",
      "Hostels, hospitals, resorts, and commercial canteens",
      "Industrial pre-heating for boilers and cleaning facilities"
    ],
    installationInfo: "Rooftop south-facing installation with minimum shadow obstruction. Plumbing lines plumbed by True Power Solutions certified technicians.",
    warrantyInfo: "Manufacturer warranty supported by True Power Solutions."
  },
  {
    id: "wisy-wff-100",
    name: "WISY WFF 100 Vortex Rainwater Filter",
    slug: "wisy-wff-100-vortex-rainwater-filter",
    brand: "WISY",
    category: "Rainwater Filters",
    featured: true,
    image: "/assets/images/wisy-filter.jpg",
    shortDescription: "German engineered in-ground vortex rainwater filter with 0.28 mm stainless steel self-cleaning mesh for roof areas up to 200 m².",
    overview: "The WISY Vortex Fine Filter WFF 100 separates debris, moss, and leaves from roof rainwater through centrifugal vortex action. Clean water flows horizontally to storage while leaves and sediment are automatically washed down the drain.",
    keyFeatures: [
      "Genuine German vortex filtration principle with self-cleaning action",
      "Fine 0.28 mm (280 microns) stainless steel mesh cylinder",
      "Extracts over 90% of rainwater into the clean storage tank",
      "Housing made of polypropylene, traffic-loadable up to 30 tons",
      "Zero consumables and ultra-low maintenance"
    ],
    technicalSpecifications: {
      "Roof Catchment Area": "Up to 200 m² (WFF 150 up to 500 m²)",
      "Inlet / Outlet Size": "DN 100 (110 mm OD)",
      "Clean Water Outlet": "DN 100",
      "Filter Mesh Size": "0.28 mm (280 µm) Stainless Steel",
      "Flow Efficiency": "> 90% clean water harvesting yield",
      "Standard Rating": "DIN 1989 / EN 12056 compliant"
    },
    applications: [
      "Residential roof rainwater harvesting systems",
      "Groundwater recharge borewells and underground cisterns",
      "Commercial roof drainage and eco-friendly industrial campuses"
    ],
    installationInfo: "Installed underground in drainage line or above ground on walls. True Power Solutions provides full sizing and installation drawings.",
    warrantyInfo: "Genuine German WISY product warranty backed by True Power Solutions."
  },
  {
    id: "sinicon-controller-epc",
    name: "SINICON Smart Electronic Pressure Controller (EPC)",
    slug: "sinicon-smart-electronic-pressure-controller",
    brand: "SINICON",
    category: "Pump Controllers",
    featured: false,
    image: "/assets/images/sinicon-controller.jpg",
    shortDescription: "Digital automated pump controller with dry-run protection, anti-jamming cycles, and instantaneous pressure response.",
    overview: "The SINICON Electronic Pressure Controller replaces conventional pressure switch and expansion tank assemblies. It automatically starts the water pump when water is consumed (tap open) and shuts it down once the tap is closed.",
    keyFeatures: [
      "Eliminates water hammer and pressure drops across plumbing taps",
      "Automatic dry-run protection stops pump immediately if water supply runs out",
      "Auto-restart function checks for water return at periodic intervals",
      "Integrated non-return valve and pressure gauge",
      "High reliability electronic circuitry with IP65 moisture protection"
    ],
    technicalSpecifications: {
      "Operating Voltage": "220-240V AC, 50/60 Hz",
      "Max Current": "10A (Up to 1.5 HP motor direct, larger via contactor)",
      "Starting Pressure Range": "1.5 bar / 2.2 bar adjustable",
      "Max Operating Pressure": "10 bar",
      "Max Liquid Temp": "60°C",
      "Inlet / Outlet Thread": "1\" Male BSP"
    },
    applications: [
      "Domestic pressure booster pump sets",
      "Overhead water tank booster line control",
      "Garden irrigation and vehicle washing pressure pumps"
    ],
    installationInfo: "Vertical installation directly on the pump discharge outlet or in the delivery line.",
    warrantyInfo: "Sinicon official manufacturer warranty supported by True Power Solutions."
  },
  {
    id: "3m-water-softener",
    name: "3M Fully Automatic Ion-Exchange Water Softener",
    slug: "3m-fully-automatic-water-softener",
    brand: "3M",
    category: "Water Softeners",
    featured: true,
    image: "/assets/images/3m-softener.jpg",
    shortDescription: "Advanced demand-initiated regeneration water softening system that prevents limescale buildup and softens harsh groundwater.",
    overview: "Hard water rich in calcium and magnesium causes severe scale buildup in solar heaters, geysers, shower fixtures, and piping. 3M's ion-exchange water softeners automatically monitor water usage and regenerate high-grade softening resins only when needed, minimizing salt and water wastage.",
    keyFeatures: [
      "High-exchange capacity food-grade ion-exchange resin",
      "Intelligent microprocessor control head tracks volume treated",
      "Demand-Initiated Regeneration (DIR) saves up to 40% salt",
      "Corrosion-proof fiberglass reinforced composite vessel",
      "Protects bathroom fittings, luxury chrome fixtures, and skin/hair health"
    ],
    technicalSpecifications: {
      "Flow Rate": "1.5 m³/h to 4.0 m³/h options",
      "Vessel Material": "FRP (Fiber Reinforced Polymer) with food grade PE liner",
      "Regeneration Mode": "Metered / Time clock automatic",
      "Operating Pressure": "1.5 to 5.0 bar",
      "Salt Storage Capacity": "25 kg - 50 kg brine tank",
      "Electrical Supply": "12V transformer with 230V 50Hz input"
    },
    applications: [
      "Villas and apartments facing hard borewell water in Salem & Tamil Nadu",
      "Pre-treatment for solar water heaters and heat pumps to avoid scaling",
      "Hotels, hospitals, and commercial laundry facilities"
    ],
    installationInfo: "Installed on main water inlet line after filtration. Includes bypass valve setup for service.",
    warrantyInfo: "3M authorized warranty handled by True Power Solutions."
  },
  {
    id: "ventura-domestic-booster",
    name: "Ventura Self-Priming Automatic Booster Pump",
    slug: "ventura-self-priming-booster-pump",
    brand: "Ventura",
    category: "Pressure Pumps",
    featured: false,
    image: "/assets/images/ventura-pump.jpg",
    shortDescription: "Whisper-quiet domestic water pressure booster pump with stainless steel chamber and automatic pressure switch.",
    overview: "Ventura automatic booster pumps provide uniform pressure across all showers, taps, and washing machines in modern homes. Engineered with thermal overload protection and high efficiency copper windings.",
    keyFeatures: [
      "Quiet operation designed specifically for residential homes",
      "Stainless steel impeller and hydraulic chamber",
      "Thermal overload protector (TOP) prevents motor burnout",
      "Automatic ON/OFF with flow switch sensor",
      "Corrosion resistant electro-deposition coating"
    ],
    technicalSpecifications: {
      "Power": "0.5 HP / 1.0 HP",
      "Max Head": "32 meters",
      "Max Flow": "45 LPM",
      "Voltage": "230V, 50 Hz Single Phase",
      "Pipe Size": "25 mm x 25 mm (1\" x 1\")"
    },
    applications: [
      "Individual residential homes and 1-2 story villas",
      "Booster water supply for solar water heater outlets and rain showers"
    ],
    installationInfo: "Horizontal mounting with inlet strainer.",
    warrantyInfo: "Manufacturer warranty supported by True Power Solutions."
  }
];

export const seedServices = [
  {
    id: "pressure-pump-installation",
    title: "Pressure Pump Installation",
    category: "Installation",
    shortDescription: "Professional installation of domestic, villa, and commercial hydro-pneumatic pressure booster pumps.",
    description: "Our certified engineering technicians ensure optimal pump sizing, pipe alignment, anti-vibration damping, non-return valve positioning, and electrical surge protection for peak performance and leak-free reliability.",
    features: [
      "Accurate pressure rating calculation based on bathroom count & fixture types",
      "Vibration dampening and noise isolation base plate setup",
      "Pressure switch calibration and flow sensor testing",
      "Bypass loop manifold for uninterrupted water during maintenance"
    ],
    icon: "Gauge"
  },
  {
    id: "pressure-pump-repair-servicing",
    title: "Pressure Pump Repair & Servicing",
    category: "Repair & Maintenance",
    shortDescription: "Comprehensive diagnostic, mechanical seal replacement, pressure vessel recharging, and servicing.",
    description: "Specialized service for Grundfos, Ventura, and all leading booster pumps. We resolve pressure hunting, motor humming, leakages, pressure drop, and frequent cycling issues.",
    features: [
      "Nitrogen pre-charge pressure checking in diaphragm tanks",
      "Mechanical seal and O-ring replacement",
      "Impeller descaling and hydraulic chamber clearance restoration",
      "Quick response on-site troubleshooting across Salem & surroundings"
    ],
    icon: "Wrench"
  },
  {
    id: "water-pump-maintenance",
    title: "Water Pump Maintenance",
    category: "Preventive Care",
    shortDescription: "Preventive maintenance contracts and routine checkups for domestic and commercial water pumps.",
    description: "Proactive care to eliminate sudden breakdowns. Includes electrical insulation testing, bearing lubrication, shaft alignment, and discharge flow rate verification.",
    features: [
      "Annual Maintenance Contract (AMC) options",
      "Thermal scanning and vibration testing",
      "Electrical current draw and capacitor health testing",
      "Comprehensive performance inspection report"
    ],
    icon: "Activity"
  },
  {
    id: "pump-motor-servicing",
    title: "Pump Motor Servicing",
    category: "Repair & Maintenance",
    shortDescription: "Rewinding, bearing replacement, capacitor testing, and dynamic balancing for electric motors.",
    description: "Authorized repair and overhaul for KOEL, Grundfos, and all industrial single-phase and three-phase electric induction motors using 100% genuine copper windings.",
    features: [
      "Precision copper coil rewinding with Class F/H insulation varnish",
      "Dynamic balancing of rotating armatures",
      "Replacement of worn bearings with premium SKF/FAG bearings",
      "Terminal box and seal waterproofing"
    ],
    icon: "Cpu"
  },
  {
    id: "heat-pump-installation-service",
    title: "Heat Pump Installation & Service",
    category: "Heating Solutions",
    shortDescription: "End-to-end installation and maintenance of thermodynamic heat pump water heaters for residential and commercial projects.",
    description: "Maximize your hot water energy savings. We calculate thermal loads, manage refrigerant circuit checks, set up secondary recirculation loops, and fine-tune digital temperature parameters.",
    features: [
      "Thermodynamic sizing for villas, hotels, and apartments",
      "Eco-refrigerant pressure testing and leak detection",
      "Integration with existing plumbing and recirculating return pumps",
      "Thermostat and multi-mode timer configuration"
    ],
    icon: "Flame"
  },
  {
    id: "water-heater-installation-service",
    title: "Water Heater Installation & Service",
    category: "Heating Solutions",
    shortDescription: "Certified mounting, safety valve installation, descaling, and element replacement for Racold & V-Guard geysers.",
    description: "Safety-first installation for storage and instant water heaters. We ensure high-pressure compliance with booster pumps, pressure reducing valves, and electrical earthing checks.",
    features: [
      "Pressure safety valve (PRV) testing to prevent tank bursts",
      "Magnesium sacrificial anode rod replacement against hard water corrosion",
      "Heating element descaling and replacement",
      "Precision thermostat calibration"
    ],
    icon: "ShieldAlert"
  },
  {
    id: "solar-water-heating-solutions",
    title: "Solar Water Heating Solutions",
    category: "Renewable Energy",
    shortDescription: "Turnkey design, rooftop structural mounting, and maintenance of domestic & commercial solar water heaters.",
    description: "Harness the Tamil Nadu sun with V-Guard and Racold solar systems. We handle angle optimization, glass tube cleaning, plumbing insulation, and auxiliary backup heating integration.",
    features: [
      "Custom rooftop layout and shadow analysis",
      "Anti-airlock plumbing loop design with auto air release valves",
      "Glass tube cleaning and vacuum loss inspection",
      "Commercial solar heating manifold engineering"
    ],
    icon: "Sun"
  },
  {
    id: "pump-controller-installation-repair",
    title: "Pump Controller Installation & Repair",
    category: "Automation",
    shortDescription: "Installation of SINICON automated water level controllers, digital pressure controllers, and dry-run protection units.",
    description: "Automate your water management. Never suffer overhead tank overflows or sump dry-running again. We install magnetic sensors, electronic pressure controllers, and smart timers.",
    features: [
      "Overhead tank and underground sump automated sync",
      "Dry-run protection to safeguard expensive pumps",
      "Solid-state electronic controller diagnosis and replacement",
      "Surge suppression and lightning protection wiring"
    ],
    icon: "Sliders"
  },
  {
    id: "rainwater-filtration-solutions",
    title: "Rainwater Filtration Solutions",
    category: "Water Harvesting",
    shortDescription: "Turnkey design and installation of German WISY vortex rainwater harvesting filters for groundwater recharge.",
    description: "Harness pristine rainwater from your roof. We size and install WISY vortex filters that automatically filter leaves and debris, routing over 90% of crystal clean water to your storage cistern or recharge borewell.",
    features: [
      "Catchment area sizing and hydraulic slope calculation",
      "In-ground or wall-mounted installation with overflow drainage lines",
      "Stainless steel mesh inspection and cleaning protocol",
      "Assistance with rainwater harvesting regulatory compliance"
    ],
    icon: "Droplets"
  },
  {
    id: "water-softener-installation-maintenance",
    title: "Water Softener Installation & Maintenance",
    category: "Water Treatment",
    shortDescription: "Installation and scheduled salt replenishment/resin regeneration for 3M ion-exchange water softeners.",
    description: "Eliminate tough white limescale stains in Salem's borewell water. We test raw water hardness, install 3M automatic softeners, and set regeneration cycles tailored to your household consumption.",
    features: [
      "Total Dissolved Solids (TDS) and Total Hardness (CaCO3) water testing",
      "Automated volumetric regeneration valve programming",
      "High-grade resin rejuvenation and brine tank maintenance",
      "Whole-house plumbing scale protection"
    ],
    icon: "Sparkles"
  }
];

export const companyDetails = {
  name: "TRUE POWER SOLUTIONS",
  proprietor: "A. LOGANATHAN B.E.",
  tagline: "Powering Your Water Systems With Trust & Technology",
  phoneNumbers: ["91597 87878", "94866 66645"],
  email: "loganengg@gmail.com",
  officeAddress: {
    line1: "99/87, Swarnapuri Annexe",
    line2: "Near ANS Dhivyam, Omalur Main Road",
    landmark: "Kuranguchavadi",
    city: "Salem",
    pincode: "636 004",
    state: "Tamil Nadu",
    country: "India"
  },
  mapsCoordinates: {
    lat: 11.6749,
    lng: 78.1342,
    googleMapsEmbedUrl: "https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3907.382483863773!2d78.13158!3d11.67488!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3babf03859d09c65%3A0x6b4f728fa0b5e91!2sKuranguchavadi%2C%20Salem%2C%20Tamil%20Nadu%20636004!5e0!3m2!1sen!2sin!4v1700000000000!5m2!1sen!2sin",
    googleMapsDirectionsUrl: "https://www.google.com/maps/search/?api=1&query=Kuranguchavadi+Omalur+Main+Road+Salem+Tamil+Nadu"
  },
  whatsappNumber: "919159787878",
  businessHours: "Monday – Saturday: 9:00 AM – 8:00 PM | Sunday: On-Call Emergency Service"
};
