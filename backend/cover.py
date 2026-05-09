"""Support for Automate Roller Blinds."""
import aiopulse2
from homeassistant.components.cover import (
    ATTR_POSITION,
    CoverDeviceClass,
    CoverEntity,
    CoverEntityFeature,
)
from homeassistant.core import callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from .base import AutomateBase
from .const import AUTOMATE_HUB_UPDATE, DOMAIN
from .helpers import async_add_automate_entities


async def async_setup_entry(hass, config_entry, async_add_entities):
    """Set up the Automate Rollers from a config entry."""
    hub = hass.data[DOMAIN][config_entry.entry_id]
    current = set()

    @callback
    def async_add_automate_covers():
        new_items = []
        for unique_id, roller in hub.api.rollers.items():
            if roller.closed_percent1 is not None and roller.closed_percent2 is not None:
                # TDBU shade - create two rail entities
                rail1_id = f"{unique_id}_rail1"
                rail2_id = f"{unique_id}_rail2"
                if rail1_id not in current:
                    current.add(rail1_id)
                    new_items.append(AutomateCoverRail(roller, 1))
                if rail2_id not in current:
                    current.add(rail2_id)
                    new_items.append(AutomateCoverRail(roller, 2))
            else:
                # Standard single rail shade
                if unique_id not in current:
                    cover = AutomateCover(roller)
                    current.add(unique_id)
                    if cover.include_entity():
                        new_items.append(cover)
        async_add_entities(new_items)

    hub.cleanup_callbacks.append(
        async_dispatcher_connect(
            hass,
            AUTOMATE_HUB_UPDATE.format(config_entry.entry_id),
            async_add_automate_covers,
        )
    )


class AutomateCover(AutomateBase, CoverEntity):
    """Representation of a standard Automate cover device."""

    _attr_device_class = CoverDeviceClass.SHADE

    @property
    def current_cover_position(self):
        position = None
        if self.roller.closed_percent is not None:
            position = 100 - self.roller.closed_percent
        return position

    @property
    def current_cover_tilt_position(self):
        return None

    @property
    def supported_features(self):
        supported_features = 0
        if self.current_cover_position is not None:
            supported_features |= (
                CoverEntityFeature.OPEN
                | CoverEntityFeature.CLOSE
                | CoverEntityFeature.STOP
                | CoverEntityFeature.SET_POSITION
            )
        return supported_features

    @property
    def device_info(self):
        attrs = super().device_info
        attrs["manufacturer"] = "Automate"
        attrs["model"] = self.roller.devicetype
        attrs["sw_version"] = self.roller.version
        attrs["via_device"] = (DOMAIN, self.roller.hub.id)
        attrs["name"] = self.name
        return attrs

    @property
    def is_opening(self):
        return self.roller.action == aiopulse2.MovingAction.up

    @property
    def is_closing(self):
        return self.roller.action == aiopulse2.MovingAction.down

    @property
    def is_closed(self):
        return self.roller.closed_percent == 100

    async def async_close_cover(self, **kwargs):
        await self.roller.move_down()

    async def async_open_cover(self, **kwargs):
        await self.roller.move_up()

    async def async_stop_cover(self, **kwargs):
        await self.roller.move_stop()

    async def async_set_cover_position(self, **kwargs):
        await self.roller.move_to(100 - kwargs[ATTR_POSITION])


class AutomateCoverRail(AutomateBase, CoverEntity):
    """Representation of a single rail of a TDBU Automate cover."""

    _attr_device_class = CoverDeviceClass.SHADE

    def __init__(self, roller, rail):
        """Initialize the roller rail. rail is 1 (bottom) or 2 (top)."""
        super().__init__(roller)
        self.rail = rail

    @property
    def unique_id(self):
        return f"{self.roller.id}_rail{self.rail}"

    @property
    def name(self):
        rail_name = "Bottom Rail" if self.rail == 1 else "Top Rail"
        return f"{self.roller.name} {rail_name}"

    @property
    def closed_percent(self):
        if self.rail == 1:
            return self.roller.closed_percent1
        return self.roller.closed_percent2

    @property
    def current_cover_position(self):
        if self.closed_percent is not None:
            return 100 - self.closed_percent
        return None

    @property
    def current_cover_tilt_position(self):
        return None

    @property
    def supported_features(self):
        supported_features = 0
        if self.current_cover_position is not None:
            supported_features |= (
                CoverEntityFeature.OPEN
                | CoverEntityFeature.CLOSE
                | CoverEntityFeature.STOP
                | CoverEntityFeature.SET_POSITION
            )
        return supported_features

    @property
    def device_info(self):
        attrs = super().device_info
        attrs["manufacturer"] = "Automate"
        attrs["model"] = self.roller.devicetype
        attrs["sw_version"] = self.roller.version
        attrs["via_device"] = (DOMAIN, self.roller.hub.id)
        attrs["name"] = self.name
        return attrs

    @property
    def is_opening(self):
        return self.roller.action == aiopulse2.MovingAction.up

    @property
    def is_closing(self):
        return self.roller.action == aiopulse2.MovingAction.down

    @property
    def is_closed(self):
        return self.closed_percent == 100

    async def async_close_cover(self, **kwargs):
        if self.rail == 1:
            await self.roller.move_to1(100)
        else:
            await self.roller.move_to2(100)

    async def async_open_cover(self, **kwargs):
        if self.rail == 1:
            await self.roller.move_to1(0)
        else:
            await self.roller.move_to2(0)

    async def async_stop_cover(self, **kwargs):
        await self.roller.move_stop()

    async def async_set_cover_position(self, **kwargs):
        percent = 100 - kwargs[ATTR_POSITION]
        if self.rail == 1:
            await self.roller.move_to1(percent)
        else:
            await self.roller.move_to2(percent)
