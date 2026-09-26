import { TransportMode } from '../../prisma/generated/client.js';

interface VehicleSeatsInput {
    transportMode?: TransportMode;
    vehicleSeats?: number;
    vehicleSeatsOutbound?: number;
    vehicleSeatsReturn?: number;
}

export function normalizeVehicleSeats(input: VehicleSeatsInput) {
    let vehicleSeats = input.vehicleSeats ?? 0;
    let vehicleSeatsOutbound = input.vehicleSeatsOutbound ?? 0;
    let vehicleSeatsReturn = input.vehicleSeatsReturn ?? 0;

    if (input.transportMode === TransportMode.DRIVER) {
        if (vehicleSeats < 2 && vehicleSeatsOutbound < 2 && vehicleSeatsReturn < 2) {
            vehicleSeats = 2;
            vehicleSeatsOutbound = 2;
            vehicleSeatsReturn = 2;
        } else {
            if (vehicleSeatsOutbound < 2) {
                vehicleSeatsOutbound = vehicleSeats >= 2 ? vehicleSeats : vehicleSeatsReturn;
            }
            if (vehicleSeatsReturn < 2) {
                vehicleSeatsReturn = vehicleSeatsOutbound;
            }
            vehicleSeats = Math.max(vehicleSeats, vehicleSeatsOutbound, vehicleSeatsReturn);
        }
    }

    return { vehicleSeats, vehicleSeatsOutbound, vehicleSeatsReturn };
}

export function hasSplitVehicleSeats(seats: {
    vehicleSeats: number;
    vehicleSeatsOutbound: number;
    vehicleSeatsReturn: number;
}) {
    return (seats.vehicleSeatsOutbound || seats.vehicleSeats) !== (seats.vehicleSeatsReturn || seats.vehicleSeats);
}
