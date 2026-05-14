Composition
  Programs/Step
    Voices (1-4)
      Pattern (step sequencer, shaker, Euclidean generator, etc)
        Step Events
          Instrument Trigger
          Visualizer Trigger
          Instrument Parameter Locks
          Visualizer Parameter Locks
      Instrument (polyphonic SH-101-style synth, sampler + FX)
      Visualizer
      UI

This is the composable structure of a composition within the Herd system. A composition is comprised of many steps called a Program. It corresponds to a MIDI program change. Within a single Program, you have up to four Voices to find the users (a.k.a. players) will each be assigned a Voice. Within that Voice, there would be several things defined. The Voice would have an instrument such as a sampler or a polyphonic SH-101-style synth, along with all its configuration settings, such as which samples are loaded and the filter parameters that form the basis of that Voice. It would also have a Pattern, which would be a repeating sequence of Step Events that works as a step sequencer with a configurable number of steps up to 64. A Step Event can contain an Instrument Trigger, a Visualizer Trigger, both, or neither. The Instrument Trigger sends an Instrument Sounding Event, roughly equivalent to MIDI Note On. The Visualizer Trigger sends a Visualizer Display Event, the visual equivalent of Note On. Step Event Parameter Locks can override default Instrument or Visualizer values for a single event, such as pitch, velocity, duration, filter cutoff, shape, saturation, or decay. A Parameter-only Step Event is valid when a step should only change parameters without producing a note or visual Cel. An alternate type of Pattern would be a "shaker" - a special effect that uses motion of the mobile device to generate Step Events. Essentially, every time directional change is detected within the motion of the mobile device. A new Step Event would be generated and pitch duration and timing may be modulated by the parameters of that shaking. It will also be possible to apply a certain amount of quantization to those generated Step Events.

There's also a visualizer which would render visual events. Typically, this would be very simple and would be aimed at generating a overall vibe in the room - something like a pixel where the display is every mobile device in the room. A flash of HSBA color, for instance.

Then we have the UI. UI Devices are Voice-local, but they can appear at key moments within a Program. Perhaps at the beginning, there's only one voice, and then a UI pops up and prompts the users to choose a voice, and then after that they are divided into these grouped voices. Or if a new program begins, and it uses a shaker rather than a pattern. The UI would prompt the user to shake their device.
